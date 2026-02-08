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
/** Ссылка запуска бота / теста (кнопка «Открыть MedTest»). */
const BOT_START_URL = (process.env.TELEGRAM_BOT_START_URL ?? 'https://t.me/ziyomedbot/start').trim();

if (!TELEGRAM_BOT_TOKEN) {
  console.error('[ziyoda-bot] TELEGRAM_BOT_TOKEN is required. Set it in apps/api/.env');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
/** URL аватарки Зиёды для приветствия по /start (должен быть доступен по HTTPS для Telegram). */
const ZIYODA_AVATAR_URL = PLATFORM_URL ? `${PLATFORM_URL}/ziyoda-avatar.png` : '';
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

/** Шапка для каждого сообщения от ИИ: на русском или узбекском. */
const HEADER_RU = '👩‍⚕️ Отвечает ЗиёдаИИ';
const HEADER_UZ = '👩‍⚕️ ЗиёдаИИ жавоб беради';

function wrapWithHeader(text: string, lang: 'ru' | 'uz'): string {
  const header = lang === 'uz' ? HEADER_UZ : HEADER_RU;
  return `${header}\n\n${text}`;
}

function getWelcomeMessage(firstName: string, lang: 'ru' | 'uz'): string {
  const name = firstName?.trim() || 'User';
  if (lang === 'uz') {
    return wrapWithHeader(
      `Salom, ${name}!\n\n` +
        `👋 Men ZiyoMed rasmiy yordamchisi — Ziyoda.\n\n` +
        `📌 Sizga qanday yordam bera olaman?\n` +
        `Savolingizni yozing.`,
      'uz'
    );
  }
  return wrapWithHeader(
    `Здравствуйте, ${name}!\n\n` +
      `👋 Я Зиёда — официальный помощник ZiyoMed.\n\n` +
      `📌 Чем могу помочь?\n` +
      `Напишите ваш вопрос.`,
    'ru'
  );
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

/** Инлайн-кнопки главного меню (Открыть MedTest, Как пользоваться, Мой профиль). */
function getMainMenuKeyboard(lang: 'ru' | 'uz'): TelegramInlineKeyboard {
  const openLabel = lang === 'uz' ? '🚀 MedTest ni ochish' : '🚀 Открыть MedTest';
  const helpLabel = lang === 'uz' ? "📘 Qanday foydalanish" : '📘 Как пользоваться';
  const profileLabel = lang === 'uz' ? "👤 Mening profilim" : '👤 Мой профиль';
  const rows: TelegramInlineButton[][] = [];
  rows.push([{ text: openLabel, url: BOT_START_URL }]);
  rows.push([{ text: helpLabel, callback_data: 'help' }]);
  rows.push([{ text: profileLabel, callback_data: 'profile' }]);
  return { inline_keyboard: rows };
}

/** Темы инструкции: заголовок RU, UZ и URL Telegraph. Заполните реальные ссылки после публикации статей на telegra.ph */
const HELP_TOPICS: { ru: string; uz: string; url: string }[] = [
  { ru: '📌 Как начать', uz: "📌 Qanday boshlash", url: 'https://telegra.ph/ZiyoMed-Kak-nachat-01' },
  { ru: '🔐 Регистрация и вход', uz: "🔐 Ro'yxatdan o'tish va kirish", url: 'https://telegra.ph/ZiyoMed-Registraciya-02' },
  { ru: '📝 Тестовый экзамен', uz: '📝 Test imtihoni', url: 'https://telegra.ph/ZiyoMed-Test-03' },
  { ru: '🎤 Устный экзамен', uz: "🎤 Og'zaki imtihon", url: 'https://telegra.ph/ZiyoMed-Ustnyj-04' },
  { ru: '💳 Подписка и оплата', uz: "💳 Obuna va to'lov", url: 'https://telegra.ph/ZiyoMed-Podpiska-05' },
  { ru: '📜 Сертификат', uz: '📜 Sertifikat', url: 'https://telegra.ph/ZiyoMed-Sertifikat-06' },
  { ru: '👤 Профиль и настройки', uz: "👤 Profil va sozlamalar", url: 'https://telegra.ph/ZiyoMed-Profil-07' },
];

function getHelpTopicsKeyboard(lang: 'ru' | 'uz'): { inline_keyboard: { text: string; url: string }[][] } {
  const rows = HELP_TOPICS.map((t) => [{ text: lang === 'uz' ? t.uz : t.ru, url: t.url }]);
  return { inline_keyboard: rows };
}

const HELP_INTRO_RU = '👩‍⚕️ Отвечает ЗиёдаИИ\n\n📘 Как пользоваться ZiyoMed\n\nВыберите тему — откроется инструкция с фото:';
const HELP_INTRO_UZ = "👩‍⚕️ ЗиёдаИИ жавоб беради\n\n📘 ZiyoMed dan qanday foydalanish\n\nMavzuni tanlang — fotosuratlar bilan qo'llanma ochiladi:";


type TelegramInlineButton = { text: string; url?: string; callback_data?: string };
type TelegramInlineKeyboard = { inline_keyboard: TelegramInlineButton[][] };
type ReplyMarkup = TelegramInlineKeyboard;

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

/** Отправка фото с подписью (для приветствия по /start). */
async function sendPhoto(chatId: number, photoUrl: string, caption: string, replyMarkup?: ReplyMarkup): Promise<void> {
  const url = `${TELEGRAM_API}/sendPhoto`;
  const body: { chat_id: number; photo: string; caption: string; reply_markup?: ReplyMarkup } = { chat_id: chatId, photo: photoUrl, caption };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 403 && errText.includes('blocked by the user')) return;
    console.error('[sendPhoto]', res.status, errText);
  }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const url = `${TELEGRAM_API}/answerCallbackQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: text ?? undefined }),
  });
  if (!res.ok) console.error('[answerCallbackQuery]', await res.text());
}

const conversationContext = new Map<string, { lastUserMessage: string; lastBotMessage: string }>();

type TelegramUpdate = {
  update_id: number;
  message?: { chat: { id: number }; from?: { id: number; first_name?: string }; text?: string };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string };
    message?: { chat: { id: number } };
    data?: string;
  };
};

async function getUpdates(): Promise<TelegramUpdate[]> {
  const url = `${TELEGRAM_API}/getUpdates?timeout=30&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram getUpdates ${res.status}`);
  const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
  return Array.isArray(data.result) ? data.result : [];
}

const MAX_CONTEXT_LEN = 280;
function truncateContext(s: string): string {
  const t = s.trim();
  return t.length <= MAX_CONTEXT_LEN ? t : t.slice(0, MAX_CONTEXT_LEN);
}

type AskZiyodaResult = {
  answer: string;
  limitReached?: boolean;
  noAnswerFound?: boolean;
  /** Язык ответа (ru/uz), для шапки сообщения. */
  lang?: 'ru' | 'uz';
  inlineButtons?: { text: string; url?: string; callback_data?: string }[][];
};

async function askZiyoda(
  telegramId: string,
  firstName: string | undefined,
  message: string,
  previousUserMessage?: string,
  previousBotMessage?: string
): Promise<AskZiyodaResult> {
  const body: Record<string, unknown> = {
    telegramId: String(telegramId),
    message: message.trim(),
  };
  if (firstName && String(firstName).trim() && String(firstName).trim().toLowerCase() !== 'user') {
    body.firstName = String(firstName).trim();
  }
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
  const data = (await res.json()) as { answer?: string; limitReached?: boolean; noAnswerFound?: boolean; lang?: 'ru' | 'uz'; inlineButtons?: { text: string; url?: string; callback_data?: string }[][] };
  return {
    answer: data.answer ?? '',
    limitReached: data.limitReached,
    noAnswerFound: data.noAnswerFound,
    lang: data.lang,
    inlineButtons: data.inlineButtons,
  };
}

function isUzbekCyrillic(text: string): boolean {
  return /[\u04E6\u0493\u049B\u04B3\u04B7\u04E9]/.test(text);
}

/** Определение языка для шапки/кнопок: латиница без кириллицы = узбекский, узбекская кириллица = узбекский, иначе русский. */
function detectLangForBot(text: string): 'ru' | 'uz' {
  if (text === '/start') return 'uz';
  if (isUzbekCyrillic(text)) return 'uz';
  if (!/[\u0400-\u04FF]/.test(text) && /[a-zA-Z]/.test(text)) return 'uz';
  return 'ru';
}

async function run(): Promise<void> {
  console.log('[ziyoda-bot] Started. API:', BOT_API_URL);
  await fetch(`${TELEGRAM_API}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start', description: 'Запуск / Start' },
        { command: 'menu', description: 'Меню / Menu' },
      ],
    }),
  }).catch(() => {});

  while (true) {
    try {
      const updates = await getUpdates();
      for (const u of updates) {
        offset = u.update_id + 1;
        const cq = u.callback_query;
        if (cq) {
          const chatId = cq.message?.chat?.id ?? 0;
          const telegramId = String(cq.from?.id ?? '');
          const data = cq.data ?? '';
          const lang = isUzbekCyrillic(telegramId) ? 'uz' : 'ru';
          try {
            await answerCallbackQuery(cq.id);
            if (data === 'help') {
              const helpIntro = lang === 'uz' ? HELP_INTRO_UZ : HELP_INTRO_RU;
              await sendMessage(chatId, helpIntro, getHelpTopicsKeyboard(lang));
            } else             if (data === 'profile') {
              const pr = await fetch(`${BOT_API_URL}/bot/profile?telegramId=${encodeURIComponent(telegramId)}`);
              const profile = (await pr.json()) as {
                ok?: boolean;
                telegramId?: string;
                hasSubscription?: boolean;
                subscriptionEndsAt?: string | null;
                lastPaymentAt?: string | null;
                lastPaymentAmountTiyin?: number | null;
                lastPaymentKind?: string | null;
              };
              if (profile?.ok) {
                const fmt = (s: string) => {
                  const d = new Date(s);
                  const day = d.getDate().toString().padStart(2, '0');
                  const month = (d.getMonth() + 1).toString().padStart(2, '0');
                  return `${day}-${month}-${d.getFullYear()}`;
                };
                const endAt = profile.subscriptionEndsAt ? fmt(profile.subscriptionEndsAt) : '—';
                const lastPay =
                  profile.lastPaymentAt ?
                    fmt(profile.lastPaymentAt) + (profile.lastPaymentAmountTiyin != null ? ` (${(profile.lastPaymentAmountTiyin / 100).toFixed(0)} сум)` : '')
                  : '—';
                const msgRu =
                  `👤 Профиль\n\n` +
                  `Telegram ID: ${profile.telegramId ?? telegramId}\n` +
                  `Подписка: ${profile.hasSubscription ? 'активна' : 'нет'}\n` +
                  `Действует до: ${endAt}\n` +
                  `Последняя оплата: ${lastPay}`;
                const msgUz =
                  `👤 Profil\n\n` +
                  `Telegram ID: ${profile.telegramId ?? telegramId}\n` +
                  `Obuna: ${profile.hasSubscription ? 'faol' : "yo'q"}\n` +
                  `Amal qiladi: ${endAt}\n` +
                  `So'nggi to'lov: ${lastPay}`;
                const msg = lang === 'uz' ? msgUz : msgRu;
                await sendMessage(chatId, msg);
              } else {
                await sendMessage(chatId, lang === 'uz' ? 'Profil yuklanmadi.' : 'Не удалось загрузить профиль.');
              }
            }
          } catch (e) {
            console.error('[ziyoda-bot] callback', e);
          }
          continue;
        }

        const msg = u.message;
        if (!msg?.text || !msg.chat) continue;
        const chatId = msg.chat.id;
        const from = msg.from;
        const telegramId = String(from?.id ?? '');
        const firstName = from?.first_name;
        const text = msg.text.trim();
        if (!text) continue;
        const langFromText = detectLangForBot(text);

        try {
          let answer: string;
          let replyMarkup: ReplyMarkup | undefined;

          if (text === '/menu') {
            const lang = langFromText;
            answer = wrapWithHeader(
              lang === 'uz' ? '📋 Quyidagi tugmalardan foydalaning:' : '📋 Воспользуйтесь кнопками ниже:',
              lang
            );
            replyMarkup = getMainMenuKeyboard(lang);
          } else if (isGreetingOrStart(text)) {
            const lang = langFromText;
            const welcomeText = getWelcomeMessage(firstName ?? 'User', lang);
            const cap = welcomeText.length > 1024 ? welcomeText.slice(0, 1021) + '...' : welcomeText;
            if (ZIYODA_AVATAR_URL) {
              await sendPhoto(chatId, ZIYODA_AVATAR_URL, cap);
            } else {
              await sendMessage(chatId, welcomeText);
            }
            continue;
          } else if (isStartTestIntent(text)) {
            const lang = langFromText;
            answer = wrapWithHeader(getStartTestMessage(lang), lang);
            replyMarkup = { inline_keyboard: [[{ text: getPlatformButtonLabel(lang), url: BOT_START_URL }]] };
          } else {
            const ctx = conversationContext.get(telegramId);
            const result = await askZiyoda(
              telegramId,
              firstName,
              text,
              ctx?.lastUserMessage,
              ctx?.lastBotMessage
            );
            const lang = result.lang ?? langFromText;
            answer = wrapWithHeader(result.answer, lang);
            const raw = result.answer.trim();
            const isNoInfoFallback =
              /в базе зиёды нет/i.test(raw) ||
              /ziyoda bazasida .* ma['ʼʻ]lumot yo['ʼʻ]q/i.test(raw);
            if (result.limitReached || result.noAnswerFound || isNoInfoFallback) {
              replyMarkup =
                result.inlineButtons?.length ?
                  { inline_keyboard: result.inlineButtons }
                : getMainMenuKeyboard(lang);
            }
            conversationContext.set(telegramId, {
              lastUserMessage: text,
              lastBotMessage: result.answer,
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
