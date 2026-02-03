import { Request, Response, NextFunction } from 'express';

export interface AuthUser {
  id: string;        // внутренний userId
  telegramId: string;
  role: 'authorized' | 'admin';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function telegramAuthStub(
  req: Request,
  res: Response,
  next: NextFunction
) {
  /**
   * ❗ ВРЕМЕННО
   * Здесь позже будет:
   *  - проверка Telegram hash
   *  - поиск пользователя в БД
   */

  const telegramId = process.env.DEV_TELEGRAM_ID?.trim() || '123456';
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

  next();
}

export default telegramAuthStub;
