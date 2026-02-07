import { Router } from 'express';
import { cleanupStore, listBroadcasts, isBlacklisted } from '../admin/admin.store';
import { prisma } from '../../db/prisma';

const router = Router();

router.get('/', (req, res) => {
  cleanupStore();
  const telegramId = req.user?.telegramId;
  if (telegramId && isBlacklisted(telegramId)) {
    return res.status(503).end();
  }
  res.json({ items: listBroadcasts() });
});

router.post('/dismiss', async (req, res) => {
  const userId = req.user?.id;
  const telegramId = req.user?.telegramId;
  if (!userId || !telegramId) {
    return res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
  }
  const broadcastId = typeof req.body?.broadcastId === 'string' ? req.body.broadcastId.trim() : '';
  if (!broadcastId) {
    return res.status(400).json({ ok: false, reasonCode: 'INVALID_INPUT' });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { dismissedBroadcastIds: true },
    });
    if (!user) {
      return res.status(404).json({ ok: false, reasonCode: 'USER_NOT_FOUND' });
    }
    const ids = user.dismissedBroadcastIds ?? [];
    if (ids.includes(broadcastId)) {
      return res.json({ ok: true });
    }
    await prisma.user.update({
      where: { telegramId },
      data: { dismissedBroadcastIds: [...ids, broadcastId] },
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[broadcasts/dismiss]', e);
    return res.status(500).json({ ok: false, reasonCode: 'INTERNAL_ERROR' });
  }
});

export default router;
