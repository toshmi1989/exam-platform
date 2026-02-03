import { Router } from 'express';
import { cleanupStore, listBroadcasts, isBlacklisted } from '../admin/admin.store';

const router = Router();

router.get('/', (req, res) => {
  cleanupStore();
  const telegramId = req.user?.telegramId;
  if (telegramId && isBlacklisted(telegramId)) {
    return res.status(503).end();
  }
  res.json({ items: listBroadcasts() });
});

export default router;
