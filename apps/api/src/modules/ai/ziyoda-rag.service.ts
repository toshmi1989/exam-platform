/**
 * RAG service for Ziyoda Telegram bot: cache, vector search, GPT-4.1 mini.
 */

import * as crypto from 'crypto';
import { prisma } from '../../db/prisma';
import { getEmbedding, findTopK } from './embedding';
import { generateForZiyoda } from './ziyoda-llm.client';

const FALLBACK_RU =
  'К сожалению, в официальных материалах ZiyoMed это не указано.';
const FALLBACK_UZ =
  "Afsuski, ZiyoMed rasmiy materiallarida bu ko'rsatilmagan.";
const UNAVAILABLE_RU = 'Зиёда временно недоступна. Попробуйте позже.';
const UNAVAILABLE_UZ = "Ziyoda vaqtincha mavjud emas. Keyinroq urunib ko'ring.";

export type ZiyodaLang = 'ru' | 'uz';

export function detectLang(text: string): ZiyodaLang {
  const trimmed = text.trim();
  if (!trimmed) return 'ru';
  let cyrillic = 0;
  let latin = 0;
  for (const ch of trimmed) {
    if (/[\u0400-\u04FF]/.test(ch)) cyrillic++;
    else if (/[a-zA-Z]/.test(ch)) latin++;
  }
  return cyrillic >= latin ? 'ru' : 'uz';
}

function buildPrompt(
  lang: ZiyodaLang,
  firstName: string,
  contextChunks: string[],
  question: string
): string {
  const contextText =
    contextChunks.length > 0
      ? contextChunks.join('\n\n---\n\n')
      : '';
  const langLabel = lang === 'uz' ? 'uz' : 'ru';
  const fallback = lang === 'uz' ? FALLBACK_UZ : FALLBACK_RU;

  const systemPart = `You are Ziyoda — official ZiyoMed assistant.
Rules:
- Answer ONLY from the context below. No assumptions or external knowledge.
- If the answer is not in the context, reply exactly: ${fallback}
- Greet the user by first name. Be polite, professional, concise.
- Reply in language: ${langLabel} (Russian or Uzbek as specified).

User first name: ${firstName}
Language: ${langLabel}

Context from ZiyoMed materials:
<chunks>
${contextText || '(no relevant fragments)'}
</chunks>

Question:
${question}`;

  return systemPart;
}

export async function askZiyoda(
  question: string,
  user: { firstName?: string }
): Promise<string> {
  const trimmed = question.trim();
  if (!trimmed) {
    return detectLang(question) === 'uz' ? FALLBACK_UZ : FALLBACK_RU;
  }

  const lang = detectLang(trimmed);
  const firstName = (user.firstName ?? 'User').trim() || 'User';
  const questionHash = crypto.createHash('sha256').update(trimmed).digest('hex');

  try {
    const cached = await prisma.botAnswerCache.findUnique({
      where: { questionHash },
    });
    if (cached) return cached.answer;

    const queryEmbedding = await getEmbedding(trimmed);

    const entries = await prisma.knowledgeBaseEntry.findMany({
      select: { id: true, content: true, embedding: true },
    });

    const top = findTopK(
      queryEmbedding,
      entries.map((e) => ({
        id: e.id,
        content: e.content,
        embedding: e.embedding,
      })),
      4
    );
    const contextChunks = top.map((e) => e.content);

    const prompt = buildPrompt(lang, firstName, contextChunks, trimmed);
    const answer = await generateForZiyoda(prompt);

    await prisma.botAnswerCache.upsert({
      where: { questionHash },
      create: { questionHash, answer },
      update: { answer },
    });

    return answer;
  } catch (err) {
    const isLangUz = lang === 'uz';
    if (err instanceof Error && (err.message.includes('OPENAI') || err.message.includes('API'))) {
      return isLangUz ? UNAVAILABLE_UZ : UNAVAILABLE_RU;
    }
    return isLangUz ? FALLBACK_UZ : FALLBACK_RU;
  }
}
