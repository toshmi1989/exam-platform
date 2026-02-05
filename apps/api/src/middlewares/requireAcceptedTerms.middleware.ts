import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';

const PATHS_SKIP_AGREEMENT = [
  '/health',
  '/api',
  '/me',
  '/accept-agreement',
  '/auth/telegram',
  '/auth/telegram-widget',
];

function pathSkipsAgreement(path: string): boolean {
  const normalized = path.split('?')[0];
  return PATHS_SKIP_AGREEMENT.some(
    (p) => normalized === p || normalized.startsWith(p + '/')
  );
}

/**
 * For protected routes: if user is authenticated but has not accepted terms,
 * return 403 with reasonCode AGREEMENT_REQUIRED so frontend can show the agreement modal.
 */
export async function requireAcceptedTerms(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (pathSkipsAgreement(req.path)) {
    return next();
  }

  const telegramId = req.user?.telegramId;
  if (!telegramId) {
    return next();
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { acceptedTerms: true },
    });
    if (!user) {
      return next();
    }
    if (!user.acceptedTerms) {
      res.status(403).json({
        ok: false,
        reasonCode: 'AGREEMENT_REQUIRED',
      });
      return;
    }
  } catch (e) {
    next(e);
    return;
  }
  next();
}
