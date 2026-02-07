import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { askZiyoda } from '../ai/ziyoda-rag.service';
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
  const buyLabel = lang === 'uz' ? "Obuna sotib olish" : 'Купить подписку';
  const rows: { text: string; url?: string; callback_data?: string }[][] = [];
  rows.push([{ text: openLabel, url: BOT_START_URL }]);
  if (PLATFORM_URL) {
    rows.push([{ text: buyLabel, url: `${PLATFORM_URL}/cabinet` }]);
  }
  rows.push([{ text: helpLabel, callback_data: 'help' }]);
  rows.push([{ text: profileLabel, callback_data: 'profile' }]);
  return rows;
}

router.post('/ask', async (req: Request, res: Response): Promise<void> => {
  const telegramId =
    typeof req.body?.telegramId === 'string' ? req.body.telegramId.trim() : '';
  const firstName =
    typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : undefined;
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
    const limitResult = await checkBotAiLimit(telegramId);
    if (!limitResult.allowed) {
      const lang = /[\u04E6\u0493\u049B\u04B3\u04B7\u04E9]/.test(message) ? 'uz' : 'ru';
      const answer = lang === 'uz' ? LIMIT_MESSAGE_UZ : LIMIT_MESSAGE_RU;
      res.json({
        answer,
        limitReached: true,
        inlineButtons: buildLimitInlineButtons(lang),
      });
      return;
    }

    await recordBotAiRequest(telegramId);
    const answer = await askZiyoda(message, {
      firstName: firstName ?? (telegramId ? undefined : 'User'),
      previousUserMessage,
      previousBotMessage,
    });
    res.json({ answer });
  } catch (err) {
    console.error('[bot/ask]', err);
    res.status(500).json({
      ok: false,
      error: 'Ziyoda is temporarily unavailable.',
    });
  }
});

/** Для кнопки «Мой профиль»: возвращает данные пользователя по telegramId (вызов от бота). */
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  const telegramId =
    typeof req.query?.telegramId === 'string' ? req.query.telegramId.trim() : '';
  if (!telegramId) {
    res.status(400).json({ ok: false, error: 'telegramId required' });
    return;
  }
  try {
    const userId = `tg-${telegramId}`;
    const [user, sub] = await Promise.all([
      prisma.user.findUnique({ where: { telegramId }, select: { id: true, firstName: true } }),
      prisma.userSubscription.findFirst({
        where: { userId, endsAt: { gte: new Date() } },
        orderBy: { endsAt: 'desc' },
        select: { endsAt: true },
      }),
    ]);
    const cabinetUrl = PLATFORM_URL ? `${PLATFORM_URL}/cabinet` : '';
    res.json({
      ok: true,
      telegramId,
      firstName: user?.firstName ?? null,
      hasSubscription: Boolean(sub),
      subscriptionEndsAt: sub?.endsAt?.toISOString() ?? null,
      cabinetUrl: cabinetUrl || null,
    });
  } catch (err) {
    console.error('[bot/profile]', err);
    res.status(500).json({ ok: false });
  }
});

export default router;
export { buildLimitInlineButtons, PLATFORM_URL };
