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

if (!TELEGRAM_BOT_TOKEN) {
  console.error('[ziyoda-bot] TELEGRAM_BOT_TOKEN is required. Set it in apps/api/.env');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
let offset = 0;

async function getUpdates(): Promise<{ update_id: number; message?: { chat: { id: number }; from?: { id: number; first_name?: string }; text?: string } }[]> {
  const url = `${TELEGRAM_API}/getUpdates?timeout=30&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Telegram getUpdates ${res.status}`);
  }
  const data = (await res.json()) as { ok: boolean; result?: { update_id: number; message?: { chat: { id: number }; from?: { id: number; first_name?: string }; text?: string } }[] };
  return Array.isArray(data.result) ? data.result : [];
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  const url = `${TELEGRAM_API}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[sendMessage]', res.status, err);
  }
}

async function askZiyoda(telegramId: string, firstName: string | undefined, message: string): Promise<string> {
  const res = await fetch(`${BOT_API_URL}/bot/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      telegramId: String(telegramId),
      firstName: firstName ?? 'User',
      message: message.trim(),
    }),
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
          const answer = await askZiyoda(telegramId, firstName, text);
          const out = answer.length > 4096 ? answer.slice(0, 4093) + '...' : answer;
          await sendMessage(chatId, out);
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
