/**
 * Telegram bot process: long polling → POST /bot/ask → send answer.
 * Run on server: node dist/scripts/ziyoda-bot.js (after npm run build)
 * Env: TELEGRAM_BOT_TOKEN, BOT_API_URL (e.g. http://127.0.0.1:3001)
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env from cwd (apps/api when run via PM2) so vars are set before reading
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
} catch {
  // ignore
}

const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const BOT_API_URL = (process.env.BOT_API_URL ?? process.env.API_PUBLIC_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const PLATFORM_URL = (process.env.FRONTEND_URL ?? process.env.PLATFORM_URL ?? '').replace(/\/$/, '');

if (!TELEGRAM_BOT_TOKEN) {
  console.error('[ziyoda-bot] TELEGRAM_BOT_TOKEN is required. Set it in apps/api/.env');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
let offset = 0;

const GREETING_WORDS = [
  '/start',
  'salom', 'assalomu alaykum', 'assalom',
  'привет', 'здравствуйте', 'здравствуй', 'добрый день', 'доброе утро', 'добрый вечер',
  'hello', 'hi', 'hey', 'good morning', 'good afternoon',
];
function isGreetingOrStart(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/\s+/g, ' ');
  if (t.length > 50) return false;
  const normalized = t.replace(/[^\p{L}\s]/gu, '').trim();
  for (const w of GREETING_WORDS) {
    if (t === w || t.startsWith(w + ' ') || normalized === w.replace(/\s/g, '')) return true;
    if (normalized.startsWith(w.replace(/\s/g, ''))) return true;
  }
  return false;
}

function getWelcomeMessage(firstName: string, lang: 'ru' | 'uz'): string {
  const name = firstName?.trim() || 'User';
  if (lang === 'uz') {
    return `Salom, ${name}! ZiyoMed rasmiy yordamchisi — Ziyoda. Sizga qanday yordam bera olaman? Savolingizni yozing.`;
  }
  return `Здравствуйте, ${name}! Я Зиёда — официальный помощник ZiyoMed. Чем могу помочь? Напишите ваш вопрос.`;
}

const START_TEST_PHRASES = [
  'начать тест', 'начать экзамен', 'пройти тест', 'пройти экзамен', 'тест', 'экзамен',
  'test boshlash', 'imtihon boshlash', 'test', 'imtihon', 'testni boshlash',
  'start test', 'begin test', 'take test', 'take exam',
];
function isStartTestIntent(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/\s+/g, ' ');
  if (t.length > 60) return false;
  for (const phrase of START_TEST_PHRASES) {
    if (t === phrase || t.startsWith(phrase + ' ') || t.includes(phrase)) return true;
  }
  return false;
}

function getStartTestMessage(lang: 'ru' | 'uz'): string {
  if (lang === 'uz') {
    return "ZiyoMed platformasida test yoki imtihonni boshlashingiz mumkin. Quyidagi tugmani bosing.";
  }
  return "Вы можете начать тест или экзамен на платформе ZiyoMed. Нажмите кнопку ниже.";
}

function getPlatformButtonLabel(lang: 'ru' | 'uz'): string {
  return lang === 'uz' ? 'ZiyoMed ni ochish' : 'Открыть ZiyoMed';
}

const conversationContext = new Map<string, { lastUserMessage: string; lastBotMessage: string }>();

async function getUpdates(): Promise<{ update_id: number; message?: { chat: { id: number }; from?: { id: number; first_name?: string }; text?: string } }[]> {
  const url = `${TELEGRAM_API}/getUpdates?timeout=30&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Telegram getUpdates ${res.status}`);
  }
  const data = (await res.json()) as { ok: boolean; result?: { update_id: number; message?: { chat: { id: number }; from?: { id: number; first_name?: string }; text?: string } }[] };
  return Array.isArray(data.result) ? data.result : [];
}

type ReplyMarkup = { inline_keyboard: { text: string; url: string }[][] };

async function sendMessage(chatId: number, text: string, replyMarkup?: ReplyMarkup): Promise<void> {
  const url = `${TELEGRAM_API}/sendMessage`;
  const body: { chat_id: number; text: string; reply_markup?: ReplyMarkup } = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 403 && errText.includes('blocked by the user')) return;
    console.error('[sendMessage]', res.status, errText);
  }
}

const MAX_CONTEXT_LEN = 280;
function truncateContext(s: string): string {
  const t = s.trim();
  return t.length <= MAX_CONTEXT_LEN ? t : t.slice(0, MAX_CONTEXT_LEN);
}

async function askZiyoda(
  telegramId: string,
  firstName: string | undefined,
  message: string,
  previousUserMessage?: string,
  previousBotMessage?: string
): Promise<string> {
  const body: Record<string, unknown> = {
    telegramId: String(telegramId),
    firstName: firstName ?? 'User',
    message: message.trim(),
  };
  if (previousUserMessage?.trim()) body.previousUserMessage = truncateContext(previousUserMessage);
  if (previousBotMessage?.trim()) body.previousBotMessage = truncateContext(previousBotMessage);
  const res = await fetch(`${BOT_API_URL}/bot/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err?.error ?? `API ${res.status}`);
  }
  const data = (await res.json()) as { answer?: string };
  return data.answer ?? '';
}

async function run(): Promise<void> {
  console.log('[ziyoda-bot] Started. API:', BOT_API_URL);
  while (true) {
    try {
      const updates = await getUpdates();
      for (const u of updates) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (!msg?.text || !msg.chat) continue;
        const chatId = msg.chat.id;
        const from = msg.from;
        const telegramId = String(from?.id ?? '');
        const firstName = from?.first_name;
        const text = msg.text.trim();
        if (!text) continue;
        try {
          let answer: string;
          let replyMarkup: ReplyMarkup | undefined;
          const lang = /[\u0400-\u04FF]/.test(text) ? 'ru' : 'uz';

          if (isGreetingOrStart(text)) {
            answer = getWelcomeMessage(firstName ?? 'User', lang);
          } else if (PLATFORM_URL && isStartTestIntent(text)) {
            answer = getStartTestMessage(lang);
            replyMarkup = { inline_keyboard: [[{ text: getPlatformButtonLabel(lang), url: PLATFORM_URL }]] };
          } else {
            const ctx = conversationContext.get(telegramId);
            answer = await askZiyoda(
              telegramId,
              firstName,
              text,
              ctx?.lastUserMessage,
              ctx?.lastBotMessage
            );
            conversationContext.set(telegramId, {
              lastUserMessage: text,
              lastBotMessage: answer,
            });
          }
          const out = answer.length > 4096 ? answer.slice(0, 4093) + '...' : answer;
          await sendMessage(chatId, out, replyMarkup);
        } catch (e) {
          console.error('[ziyoda-bot]', e);
          await sendMessage(chatId, 'Зиёда временно недоступна. Попробуйте позже.');
        }
      }
    } catch (e) {
      console.error('[ziyoda-bot] getUpdates error', e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

run().catch((err) => {
  console.error('[ziyoda-bot] Fatal:', err);
  process.exit(1);
});
