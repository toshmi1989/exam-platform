import { Router } from 'express';
import {
  isBlacklisted,
  addMessage,
  cleanupStore,
  listMessages,
  markThreadReadByUser,
  getUnreadForUser,
} from '../admin/admin.store';

const router = Router();

router.get('/unread', (req, res) => {
  cleanupStore();
  const telegramId = req.user?.telegramId;
  if (!telegramId) {
    return res.status(401).json({ ok: false });
  }
  if (isBlacklisted(telegramId)) {
    return res.status(503).end();
  }
  const unread = getUnreadForUser(telegramId);
  res.json({ unread });
});

router.get('/messages', (req, res) => {
  cleanupStore();
  const telegramId = req.user?.telegramId;
  if (!telegramId) {
    return res.status(401).json({ ok: false });
  }
  if (isBlacklisted(telegramId)) {
    return res.status(503).end();
  }
  const messages = listMessages(telegramId);
  markThreadReadByUser(telegramId);
  res.json({ messages });
});

router.post('/messages', (req, res) => {
  cleanupStore();
  const telegramId = req.user?.telegramId;
  if (!telegramId) {
    return res.status(401).json({ ok: false });
  }
  if (isBlacklisted(telegramId)) {
    return res.status(503).end();
  }
  const text = String(req.body?.text ?? '').trim();
  const imageData = typeof req.body?.imageData === 'string' ? req.body.imageData : undefined;
  if (!text && !imageData) {
    return res.status(400).json({ ok: false });
  }
  const message = addMessage({ telegramId, author: 'user', text, imageData });
  res.json({ ok: true, message });
});

export default router;
