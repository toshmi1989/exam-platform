import { Request, Response, NextFunction } from 'express';

export function attachUserFromHeader(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (req.user) {
    return next();
  }

  const telegramId = req.header('x-telegram-id');
  if (!telegramId) {
    return next();
  }

  const adminAllowlist = (process.env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const isAdmin = adminAllowlist.includes(telegramId);

  req.user = {
    id: `tg-${telegramId}`,
    telegramId,
    role: isAdmin ? 'admin' : 'authorized',
  };

  return next();
}
