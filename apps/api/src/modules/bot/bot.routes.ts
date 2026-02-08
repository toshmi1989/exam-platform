import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { askZiyoda, detectLang } from '../ai/ziyoda-rag.service';
import { checkBotAiLimit, recordBotAiRequest } from './bot-ai-limit.service';

const router = Router();

const PLATFORM_URL = (process.env.FRONTEND_URL ?? process.env.PLATFORM_URL ?? '').replace(/\/$/, '');
/** Ссылка запуска бота / теста (кнопка «Открыть MedTest» и т.п.). */
const BOT_START_URL = (process.env.TELEGRAM_BOT_START_URL ?? 'https://t.me/ziyomedbot/start').trim();

const LIMIT_MESSAGE_RU =
  'Дневной лимит запросов к ИИ закончился. Чтобы пользоваться без ограничений функциями ИИ и платформы — оформите подписку. Вы также можете пользоваться навигацией ниже.';
const LIMIT_MESSAGE_UZ =
  "Kunlik AI so'rovlari limiti tugadi. AI va platforma funksiyalaridan cheklovsiz foydalanish uchun obuna bo'ling. Quyidagi tugmalardan ham foydalanishingiz mumkin.";

function buildLimitInlineButtons(lang: 'ru' | 'uz'): { text: string; url?: string; callback_data?: string }[][] {
  const openLabel = lang === 'uz' ? '🚀 MedTest ni ochish' : '🚀 Открыть MedTest';
  const helpLabel = lang === 'uz' ? "📘 Qanday foydalanish" : '📘 Как пользоваться';
  const profileLabel = lang === 'uz' ? "👤 Mening profilim" : '👤 Мой профиль';
  const rows: { text: string; url?: string; callback_data?: string }[][] = [];
  rows.push([{ text: openLabel, url: BOT_START_URL }]);
  rows.push([{ text: helpLabel, callback_data: 'help' }]);
  rows.push([{ text: profileLabel, callback_data: 'profile' }]);
  return rows;
}

router.post('/ask', async (req: Request, res: Response): Promise<void> => {
  const rawTelegramId = req.body?.telegramId;
  const telegramId =
    typeof rawTelegramId === 'string'
      ? rawTelegramId.trim()
      : typeof rawTelegramId === 'number' && Number.isFinite(rawTelegramId)
        ? String(rawTelegramId)
        : '';
  let firstName =
    typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : undefined;
  if (!firstName && telegramId) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { firstName: true },
    });
    if (user?.firstName?.trim()) firstName = user.firstName.trim();
  }
  const message =
    typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const previousUserMessage =
    typeof req.body?.previousUserMessage === 'string' ? req.body.previousUserMessage.trim() : undefined;
  const previousBotMessage =
    typeof req.body?.previousBotMessage === 'string' ? req.body.previousBotMessage.trim() : undefined;

  if (!message) {
    res.status(400).json({ ok: false, error: 'message is required' });
    return;
  }

  try {
    const lang = detectLang(message);
    const limitResult = await checkBotAiLimit(telegramId);
    if (!limitResult.allowed) {
      const answer = lang === 'uz' ? LIMIT_MESSAGE_UZ : LIMIT_MESSAGE_RU;
      res.json({
        answer,
        limitReached: true,
        lang,
        inlineButtons: buildLimitInlineButtons(lang),
      });
      return;
    }

    await recordBotAiRequest(telegramId);
    const result = await askZiyoda(message, {
      firstName: firstName || undefined,
      previousUserMessage,
      previousBotMessage,
    });

    async function logUnanswered(): Promise<void> {
      const msg = message.trim();
      if (msg.length === 0 || msg.length > 2000) return;
      try {
        await prisma.botUnansweredQuestion.create({
          data: {
            questionText: msg,
            telegramId: telegramId ? String(telegramId).trim() || undefined : undefined,
          },
        });
      } catch (err) {
        console.error('[bot/ask] log unanswered failed', err);
      }
    }

    if (result.noAnswerFound) {
      await logUnanswered();
      res.json({
        answer: result.answer,
        noAnswerFound: true,
        lang,
        inlineButtons: buildLimitInlineButtons(lang),
      });
      return;
    }
    const raw = result.answer.trim();
    const isNoAnswerResponse =
      /в базе зиёды нет|нет этой информации|можешь уточнить вопрос/i.test(raw) ||
      /ziyoda bazasida .* ma['ʼʻ\u0027]lumot yo['ʼʻ\u0027]q/i.test(raw) ||
      /savolni aniqlashtiring/i.test(raw) ||
      /зиёда временно недоступна|ziyoda vaqtincha mavjud emas/i.test(raw) ||
      /база знаний\s*(ziyomed)?\s*пока пуста|ziyomed bilim bazasi.*bo['ʼʻ\u0027]sh/i.test(raw) ||
      /попробуйте позже|keyinroq urunib ko['ʼʻ\u0027]ring/i.test(raw) ||
      /обратитесь к администратору|administratorga murojaat/i.test(raw);
    if (isNoAnswerResponse) {
      await logUnanswered();
    }
    res.json({ answer: result.answer, lang });
  } catch (err) {
    console.error('[bot/ask]', err);
    res.status(500).json({
      ok: false,
      error: 'Ziyoda is temporarily unavailable.',
    });
  }
});

/** Для кнопки «Мой профиль»: возвращает данные пользователя по telegramId (вызов от бота). Без кнопки «Открыть кабинет». */
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  const telegramId =
    typeof req.query?.telegramId === 'string' ? req.query.telegramId.trim() : '';
  if (!telegramId) {
    res.status(400).json({ ok: false, error: 'telegramId required' });
    return;
  }
  try {
    const userId = `tg-${telegramId}`;
    const [user, sub, lastPayment] = await Promise.all([
      prisma.user.findUnique({ where: { telegramId }, select: { id: true, firstName: true } }),
      prisma.userSubscription.findFirst({
        where: { userId, endsAt: { gte: new Date() } },
        orderBy: { endsAt: 'desc' },
        select: { endsAt: true },
      }),
      prisma.paymentInvoice.findFirst({
        where: { userId, status: 'paid', paidAt: { not: null } },
        orderBy: { paidAt: 'desc' },
        select: { paidAt: true, amountTiyin: true, kind: true },
      }),
    ]);
    res.json({
      ok: true,
      telegramId,
      firstName: user?.firstName ?? null,
      hasSubscription: Boolean(sub),
      subscriptionEndsAt: sub?.endsAt?.toISOString() ?? null,
      lastPaymentAt: lastPayment?.paidAt?.toISOString() ?? null,
      lastPaymentAmountTiyin: lastPayment?.amountTiyin ?? null,
      lastPaymentKind: lastPayment?.kind ?? null,
    });
  } catch (err) {
    console.error('[bot/profile]', err);
    res.status(500).json({ ok: false });
  }
});

export default router;
export { buildLimitInlineButtons, PLATFORM_URL };
