/**
 * Отправка рассылки пользователям через Telegram Bot API.
 * Вызывается после добавления broadcast в админке (fire-and-forget).
 */

import { prisma } from '../db/prisma';
import {
  initBroadcastStats,
  updateBroadcastStats,
  finishBroadcastStats,
} from '../modules/admin/admin.store';

const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const MAX_MESSAGE_LENGTH = 4096;

type Segment = 'all' | 'subscribed' | 'free' | 'active';

export interface BroadcastPayload {
  broadcastId: string;
  title: string;
  text: string;
  segment: string;
  imageData?: string;
}

/** Only real numeric Telegram IDs are valid — skip guest-* and empty strings. */
function isRealTelegramId(id: string): boolean {
  return /^\d+$/.test(id.trim());
}

async function getTelegramIdsBySegment(segment: Segment): Promise<string[]> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Always exclude guests and already-blocked users
  const baseFilter = {
    telegramBlocked: false,
  };

  if (segment === 'all') {
    const users = await prisma.user.findMany({
      where: baseFilter,
      select: { telegramId: true },
    });
    return users.map((u) => u.telegramId).filter(isRealTelegramId);
  }

  if (segment === 'subscribed') {
    const subs = await prisma.userSubscription.findMany({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const userIds = subs.map((s) => s.userId);
    if (userIds.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, ...baseFilter },
      select: { telegramId: true },
    });
    return users.map((u) => u.telegramId).filter(isRealTelegramId);
  }

  if (segment === 'free') {
    const subs = await prisma.userSubscription.findMany({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const subscribedIds = new Set(subs.map((s) => s.userId));
    const users = await prisma.user.findMany({
      where: baseFilter,
      select: { id: true, telegramId: true },
    });
    return users
      .filter((u) => !subscribedIds.has(u.id))
      .map((u) => u.telegramId)
      .filter(isRealTelegramId);
  }

  if (segment === 'active') {
    const attempts = await prisma.examAttempt.findMany({
      where: {
        submittedAt: { not: null, gte: thirtyDaysAgo },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const userIds = attempts.map((a) => a.userId);
    if (userIds.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, ...baseFilter },
      select: { telegramId: true },
    });
    return users.map((u) => u.telegramId).filter(isRealTelegramId);
  }

  return [];
}

/**
 * Mark user as blocked so future broadcasts skip them.
 * 403 = bot blocked / user deactivated
 * 400 chat not found = user never started the bot
 */
async function markTelegramBlocked(telegramId: string): Promise<void> {
  try {
    await prisma.user.updateMany({
      where: { telegramId },
      data: { telegramBlocked: true },
    });
  } catch {
    // Non-critical — ignore DB errors here
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramMessage(telegramId: string, text: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.warn('[broadcast-sender] TELEGRAM_BOT_TOKEN not set, skip send');
    return false;
  }
  const safeText = text.slice(0, MAX_MESSAGE_LENGTH);
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text: safeText,
        parse_mode: 'HTML' as const,
        disable_web_page_preview: true,
      }),
    });
    const body = await res.text();

    if (!res.ok) {
      // 403 = bot blocked / deactivated, 400 chat not found → mark and skip
      if (res.status === 403 || res.status === 400) {
        await markTelegramBlocked(telegramId);
      }
      console.warn('[broadcast-sender] sendMessage failed', telegramId, res.status, body.slice(0, 200));
      return false;
    }

    const data = JSON.parse(body) as { ok?: boolean };
    if (!data.ok) {
      console.warn('[broadcast-sender] sendMessage not ok', telegramId, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[broadcast-sender] sendMessage error', telegramId, err);
    return false;
  }
}

/**
 * Отправить рассылку всем пользователям выбранного сегмента (запускать в фоне).
 */
export function sendBroadcastToUsers(payload: BroadcastPayload): void {
  const segment = (['all', 'subscribed', 'free', 'active'].includes(payload.segment)
    ? payload.segment
    : 'all') as Segment;

  void (async () => {
    try {
      const telegramIds = await getTelegramIdsBySegment(segment);
      const title = escapeHtml(payload.title.trim());
      const text = escapeHtml(payload.text.trim());
      let message = `${title}\n\n${text}`;
      if (payload.imageData) {
        message += '\n\n📎 [Изображение приложено в рассылке]';
      }

      initBroadcastStats(payload.broadcastId, telegramIds.length);

      let sent = 0;
      let failed = 0;
      for (const telegramId of telegramIds) {
        const ok = await sendTelegramMessage(telegramId, message);
        if (ok) {
          sent++;
          updateBroadcastStats(payload.broadcastId, { sent: 1 });
        } else {
          failed++;
          updateBroadcastStats(payload.broadcastId, { failed: 1 });
        }
        // Small delay to avoid Telegram rate limits (30 msg/sec)
        await new Promise((r) => setTimeout(r, 35));
      }

      finishBroadcastStats(payload.broadcastId);
      console.log('[broadcast-sender] Done:', { segment, total: telegramIds.length, sent, failed });
    } catch (err) {
      finishBroadcastStats(payload.broadcastId);
      console.error('[broadcast-sender] Error:', err);
    }
  })();
}
