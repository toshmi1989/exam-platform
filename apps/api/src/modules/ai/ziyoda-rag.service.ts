/**
 * RAG service for Ziyoda Telegram bot: cache, vector search, GPT-4.1 mini.
 * Prompts and fallback texts are loaded from DB (editable in admin).
 */

import * as crypto from 'crypto';
import { prisma } from '../../db/prisma';
import { getEmbedding, findTopKWithScores } from './embedding';
import { generateForZiyoda } from './ziyoda-llm.client';
import { getZiyodaPrompts, DEFAULT_PROMPTS } from './ziyoda-prompts.service';

/** Лимиты по умолчанию (переопределяются из промптов в БД: max_chunks, max_context_chars, max_context_msg_len) */
const DEFAULT_MAX_CONTEXT_MSG_LEN = 500;
const DEFAULT_MAX_CHUNKS = 6;
const DEFAULT_MAX_CONTEXT_CHARS = 4000;

function getIntPrompt(prompts: Record<string, string>, key: string, def: number): number {
  const v = prompts[key];
  if (v === undefined || v === null) return def;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function getFloatPrompt(prompts: Record<string, string>, key: string, def: number): number {
  const v = prompts[key];
  if (v === undefined || v === null) return def;
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) && n >= 0 ? n : def;
}

export type ZiyodaLang = 'ru' | 'uz';

/** Узбекская кириллица: ӯ ғ қ ҳ ҷ ў (в русском нет). Если есть — считаем язык узбекским. */
const UZBEK_CYRILLIC = /[\u04E6\u0493\u049B\u04B3\u04B7\u04E9]/; // ӯ ғ қ ҳ ҷ ў

export function detectLang(text: string): ZiyodaLang {
  const trimmed = text.trim();
  if (!trimmed) return 'ru';
  if (UZBEK_CYRILLIC.test(trimmed)) return 'uz';
  let cyrillic = 0;
  let latin = 0;
  for (const ch of trimmed) {
    if (/[\u0400-\u04FF]/.test(ch)) cyrillic++;
    else if (/[a-zA-Z]/.test(ch)) latin++;
  }
  return cyrillic >= latin ? 'ru' : 'uz';
}

function truncateForContext(s: string, maxLen: number): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}

function buildPrompt(
  prompts: Record<string, string>,
  lang: ZiyodaLang,
  firstName: string,
  contextChunks: string[],
  question: string,
  previousExchange?: { user: string; bot: string }
): string {
  const maxChunks = getIntPrompt(prompts, 'max_chunks', DEFAULT_MAX_CHUNKS);
  const maxContextChars = getIntPrompt(prompts, 'max_context_chars', DEFAULT_MAX_CONTEXT_CHARS);
  const maxContextMsgLen = getIntPrompt(prompts, 'max_context_msg_len', DEFAULT_MAX_CONTEXT_MSG_LEN);
  let contextText =
    contextChunks.length > 0
      ? contextChunks.slice(0, maxChunks).join('\n\n')
      : '';
  if (contextText.length > maxContextChars) {
    contextText = contextText.slice(0, maxContextChars);
  }
  const langLabel = lang === 'uz' ? 'uz' : 'ru';
  const fallback = lang === 'uz' ? (prompts.fallback_uz ?? DEFAULT_PROMPTS.fallback_uz) : (prompts.fallback_ru ?? DEFAULT_PROMPTS.fallback_ru);
  const useName = firstName.trim() && firstName.trim().toLowerCase() !== 'user';
  const nameGreeting = useName
    ? (lang === 'uz' ? `${firstName.trim()}, qarang: ` : `${firstName.trim()}, смотрите: `)
    : '';
  const systemRaw = prompts.system_instruction ?? DEFAULT_PROMPTS.system_instruction;
  const systemPart = systemRaw
    .replace(/\{lang\}/g, langLabel)
    .replace(/\{fallback\}/g, fallback)
    .replace(/\{name_greeting\}/g, nameGreeting);

  const recentContext = previousExchange
    ? `\nPrev: User: ${truncateForContext(previousExchange.user, maxContextMsgLen)}\nBot: ${truncateForContext(previousExchange.bot, maxContextMsgLen)}\n`
    : '';

  return `${systemPart}${recentContext}

<chunks>
${contextText || '(none)'}
</chunks>

Q: ${question}`;
}

export async function askZiyoda(
  question: string,
  user: { firstName?: string; previousUserMessage?: string; previousBotMessage?: string }
): Promise<string> {
  const trimmed = question.trim();
  const prompts = await getZiyodaPrompts();
  const fallbackRu = prompts.fallback_ru ?? DEFAULT_PROMPTS.fallback_ru;
  const fallbackUz = prompts.fallback_uz ?? DEFAULT_PROMPTS.fallback_uz;
  const unavailableRu = prompts.unavailable_ru ?? DEFAULT_PROMPTS.unavailable_ru;
  const unavailableUz = prompts.unavailable_uz ?? DEFAULT_PROMPTS.unavailable_uz;
  const emptyKbRu = prompts.empty_kb_ru ?? DEFAULT_PROMPTS.empty_kb_ru;
  const emptyKbUz = prompts.empty_kb_uz ?? DEFAULT_PROMPTS.empty_kb_uz;

  if (!trimmed) {
    return detectLang(question) === 'uz' ? fallbackUz : fallbackRu;
  }

  const lang = detectLang(trimmed);
  const firstName = (user.firstName ?? 'User').trim() || 'User';
  const hasContext = Boolean(user.previousUserMessage?.trim() && user.previousBotMessage?.trim());
  const questionHash = crypto.createHash('sha256')
    .update(trimmed + (hasContext ? `|${user.previousUserMessage}|${user.previousBotMessage}` : ''))
    .digest('hex');

  try {
    if (!hasContext) {
      const cached = await prisma.botAnswerCache.findUnique({
        where: { questionHash },
      });
      if (cached) return cached.answer;
    }

    const queryEmbedding = await getEmbedding(trimmed);

    const entries = await prisma.knowledgeBaseEntry.findMany({
      select: { id: true, content: true, embedding: true },
    });

    if (entries.length === 0) {
      console.warn('[ziyoda-rag] База знаний пуста (KnowledgeBaseEntry = 0). Загрузите материалы в админке → AI → Зиёда AI.');
      return lang === 'uz' ? emptyKbUz : emptyKbRu;
    }

    const maxChunks = getIntPrompt(prompts, 'max_chunks', DEFAULT_MAX_CHUNKS);
    const minSimilarity = getFloatPrompt(prompts, 'min_similarity', 0.2);
    const candidateCount = Math.min(entries.length, Math.max(maxChunks * 2, 20));
    const withScores = findTopKWithScores(
      queryEmbedding,
      entries.map((e) => ({ id: e.id, content: e.content, embedding: e.embedding })),
      candidateCount
    );
    const aboveThreshold = withScores.filter((x) => x.score >= minSimilarity).slice(0, maxChunks);
    const contextChunks =
      aboveThreshold.length > 0
        ? aboveThreshold.map((x) => x.entry.content)
        : withScores.slice(0, 1).map((x) => x.entry.content);

    if (contextChunks.length === 0) {
      console.warn('[ziyoda-rag] Нет подходящих чанков (возможно, эмбеддинги другой размерности или модель изменилась). Запрос:', trimmed.slice(0, 80));
    }

    const maxContextMsgLen = getIntPrompt(prompts, 'max_context_msg_len', DEFAULT_MAX_CONTEXT_MSG_LEN);
    const previousExchange = hasContext && user.previousUserMessage && user.previousBotMessage
      ? {
          user: truncateForContext(user.previousUserMessage, maxContextMsgLen),
          bot: truncateForContext(user.previousBotMessage, maxContextMsgLen),
        }
      : undefined;
    const prompt = buildPrompt(prompts, lang, firstName, contextChunks, trimmed, previousExchange);
    const answer = await generateForZiyoda(prompt);

    if (!hasContext) {
      await prisma.botAnswerCache.upsert({
        where: { questionHash },
        create: { questionHash, answer },
        update: { answer },
      });
    }

    return answer;
  } catch (err) {
    const isLangUz = lang === 'uz';
    console.error('[ziyoda-rag] Ошибка:', err);
    if (err instanceof Error && (err.message.includes('OPENAI') || err.message.includes('API') || err.message.includes('не настроен'))) {
      return isLangUz ? unavailableUz : unavailableRu;
    }
    return isLangUz ? fallbackUz : fallbackRu;
  }
}
