// apps/api/src/modules/payments/payments.routes.ts

import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { getAccessSettings } from '../settings/accessSettings.service';
import {
  createMulticardPayment,
  getMulticardPaymentInfo,
  getPaymentRedirectUrl,
  verifyCallbackSignPayload,
  verifyCallbackSignFixedOrder,
  isMulticardConfigured,
} from './multicard.client';
import { sendPaymentNotification } from '../../services/telegramNotification.service';
import { randomUUID } from 'crypto';

const router = Router();

/** Frontend (human) → Multicard internal payment system code. */
const PS_MAP: Record<string, string> = {
  payme: 'payme',
  click: 'click',
  uzum: 'uzum',
  visa: 'card',
  mastercard: 'card',
  alif: 'alif',
  anorbank: 'anorbank',
  xazna: 'xazna',
};

const FRONTEND_URL = (process.env.FRONTEND_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * POST /payments/create
 * Body: { kind: 'one-time' | 'subscription', examId?: string, paymentSystem: string }
 * paymentSystem: frontend value (payme, click, visa, mastercard, etc.) — mapped to Multicard codes internally.
 * Returns: { checkout_url, invoiceId }
 */
router.post('/create', async (req: Request, res: Response) => {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  const kind = req.body?.kind === 'subscription' ? 'subscription' : 'one-time';
  const examId = typeof req.body?.examId === 'string' ? req.body.examId.trim() : null;
  const psRaw = typeof req.body?.paymentSystem === 'string' ? req.body.paymentSystem.trim().toLowerCase() : '';
  const ps = psRaw && PS_MAP[psRaw] ? PS_MAP[psRaw] : '';

  // Subscription requires authenticated user; one-time can be guest
  if (kind === 'subscription' && !userId) {
    return res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
  }

  // For guest one-time payments, generate guestSessionId
  let guestSessionId: string | null = null;
  if (!userId && kind === 'one-time') {
    // Check for existing guest session cookie or generate new
    const existingGuestId = req.cookies?.['guest-session-id'] || req.header('x-guest-session-id');
    if (existingGuestId && typeof existingGuestId === 'string' && existingGuestId.trim()) {
      guestSessionId = existingGuestId.trim();
    } else {
      guestSessionId = randomUUID();
      // Set cookie (30 days expiry)
      res.cookie('guest-session-id', guestSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }
  }

  if (!ps) {
    return res.status(400).json({ ok: false, reasonCode: 'INVALID_PAYMENT_SYSTEM' });
  }
  if (kind === 'one-time' && !examId) {
    return res.status(400).json({ ok: false, reasonCode: 'INVALID_EXAM' });
  }

  const settings = await getAccessSettings();
  const amountTiyin = kind === 'one-time' ? settings.oneTimePrice * 100 : settings.subscriptionPrice * 100;

  const invoiceId = randomUUID();
  const callbackUrl = `${process.env.API_PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`}/payments/multicard/callback`;
  const returnPath = kind === 'one-time'
    ? `/cabinet/pay-one-time/return?invoiceId=${invoiceId}&examId=${examId}&mode=${req.body?.mode === 'practice' ? 'practice' : 'exam'}`
    : `/cabinet/subscribe/return?invoiceId=${invoiceId}`;
  const returnUrl = `${FRONTEND_URL}${returnPath}`;

  try {
    new URL(returnUrl);
  } catch {
    return res.status(400).json({ ok: false, reasonCode: 'INVALID_RETURN_URL' });
  }
  if (!returnUrl.startsWith('https://')) {
    return res.status(400).json({
      ok: false,
      reasonCode: 'INVALID_RETURN_URL',
      message: 'FRONTEND_URL must be a public HTTPS URL (e.g. ngrok) so Multicard can redirect back.',
    });
  }

  if (!isMulticardConfigured()) {
    return res.status(503).json({ ok: false, reasonCode: 'PAYMENT_NOT_CONFIGURED' });
  }

  try {
    const payment = await createMulticardPayment({
      amount: amountTiyin,
      invoiceId,
      paymentSystem: ps,
      returnUrl,
      callbackUrl,
      lang: 'ru',
      billingId: kind === 'one-time' ? `one-time:${invoiceId}` : `subscription:${invoiceId}`,
    });

    const checkoutUrl = getPaymentRedirectUrl(payment);
    if (!checkoutUrl) {
      return res.status(500).json({ ok: false, reasonCode: 'NO_CHECKOUT_URL' });
    }

    await prisma.paymentInvoice.create({
      data: {
        invoiceId,
        userId: userId ?? null,
        guestSessionId: guestSessionId ?? null,
        kind,
        examId: kind === 'one-time' ? examId! : null,
        amountTiyin,
        ps,
        status: 'created',
        mcUuid: payment.uuid ?? null,
      },
    });

    return res.json({
      ok: true,
      checkout_url: checkoutUrl,
      invoiceId,
    });
  } catch (e) {
    console.error('[payments/create]', e);
    return res.status(500).json({ ok: false, reasonCode: 'PAYMENT_CREATE_FAILED' });
  }
});

/**
 * POST /payments/multicard/callback
 * Multicard webhook. Always return 200 "ok" to avoid retries.
 */
router.post('/multicard/callback', async (req: Request, res: Response) => {
  const data = (req.body ?? {}) as Record<string, unknown>;
  const invoiceId = String(data.invoice_id ?? '').trim();
  const uuid = String(data.uuid ?? '').trim();
  const amount = parseInt(String(data.amount ?? 0), 10) || 0;
  const gotSign = String(data.sign ?? '').trim().toLowerCase();
  const secret = (process.env.MULTICARD_SECRET ?? '').trim();

  if (!invoiceId) {
    return res.status(200).send('ok');
  }

  let signOk = false;
  if (secret && gotSign) {
    signOk = verifyCallbackSignPayload(data, secret) || verifyCallbackSignFixedOrder(data, secret);
  }

  let isPaid = signOk;
  if (!isPaid && uuid) {
    try {
      const verifyResp = await getMulticardPaymentInfo(uuid);
      const payload = (verifyResp?.data ?? verifyResp) as Record<string, unknown> | undefined;
      const status = String((payload?.status ?? '')).toLowerCase();
      if (['paid', 'success', 'completed', 'billing'].includes(status)) {
        isPaid = true;
      }
    } catch (err) {
      console.error('[payments/callback] getPaymentInfo failed', err);
    }
  }

  if (isPaid) {
    try {
      const inv = await prisma.paymentInvoice.findUnique({
        where: { invoiceId },
        select: {
          id: true,
          kind: true,
          userId: true,
          guestSessionId: true,
          examId: true,
          status: true,
          amountTiyin: true,
          mcUuid: true,
        },
      });
      if (inv && inv.status !== 'paid') {
        // Update payment invoice status and mcUuid if provided
        const updateData: { status: string; paidAt: Date; mcUuid?: string } = {
          status: 'paid',
          paidAt: new Date(),
        };
        if (uuid && !inv.mcUuid) {
          updateData.mcUuid = uuid;
        }

        await prisma.paymentInvoice.update({
          where: { invoiceId },
          data: updateData,
        });

        const settings = await getAccessSettings();
        let subscriptionEndsAt: Date | null = null;

        if (inv.kind === 'one-time' && inv.examId) {
          // Create OneTimeAccess for this payment
          // Use upsert-like logic: check if OneTimeAccess was already created for this payment
          // by checking creation time around paidAt (within 10 seconds window)
          const paidAtTime = updateData.paidAt;
          const timeWindowStart = new Date(paidAtTime.getTime() - 10000); // 10 seconds before
          const timeWindowEnd = new Date(paidAtTime.getTime() + 10000); // 10 seconds after
          
          const whereClause: {
            examId: string;
            createdAt: { gte: Date; lte: Date };
            userId?: string | null;
            guestSessionId?: string | null;
          } = {
            examId: inv.examId,
            createdAt: {
              gte: timeWindowStart,
              lte: timeWindowEnd,
            },
          };
          
          if (inv.userId) {
            whereClause.userId = inv.userId;
          } else if (inv.guestSessionId) {
            whereClause.guestSessionId = inv.guestSessionId;
          }
          
          const existing = await prisma.oneTimeAccess.findFirst({
            where: whereClause,
            select: { id: true },
          });
          
          if (!existing) {
            // Create OneTimeAccess for this payment
            try {
              await prisma.oneTimeAccess.create({
                data: {
                  userId: inv.userId ?? null,
                  guestSessionId: inv.guestSessionId ?? null,
                  examId: inv.examId,
                },
              });
            } catch (createErr: any) {
              // If unique constraint violation, ignore (already exists from concurrent callback)
              if (createErr?.code !== 'P2002') {
                console.error('[payments/callback] Failed to create OneTimeAccess:', createErr);
                throw createErr;
              }
            }
          }
        } else if (inv.kind === 'subscription') {
          // Check if subscription already exists for this payment (avoid duplicates)
          const existingSub = await prisma.userSubscription.findFirst({
            where: {
              userId: inv.userId!,
              status: 'ACTIVE',
              endsAt: { gte: new Date() },
            },
            select: { id: true },
          });
          
          if (!existingSub) {
            const now = new Date();
            subscriptionEndsAt = new Date(now);
            subscriptionEndsAt.setDate(subscriptionEndsAt.getDate() + settings.subscriptionDurationDays);
            try {
              await prisma.userSubscription.create({
                data: {
                  userId: inv.userId!,
                  endsAt: subscriptionEndsAt,
                  status: 'ACTIVE',
                },
              });
            } catch (createErr: any) {
              // If unique constraint violation or other error, log but don't fail callback
              if (createErr?.code !== 'P2002') {
                console.error('[payments/callback] Failed to create subscription:', createErr);
              }
            }
          } else {
            // Subscription already exists, calculate endsAt from existing subscription
            const existing = await prisma.userSubscription.findFirst({
              where: { userId: inv.userId! },
              orderBy: { endsAt: 'desc' },
              select: { endsAt: true },
            });
            subscriptionEndsAt = existing?.endsAt ?? null;
          }
        }

        // Send Telegram notification (non-blocking)
        void (async () => {
          try {
            console.log('[payments/callback] Preparing Telegram notification for invoice:', invoiceId);
            // Only send notification for authenticated users (not guests)
            if (!inv.userId) {
              return;
            }
            const user = await prisma.user.findUnique({
              where: { id: inv.userId },
              select: { telegramId: true, firstName: true, username: true },
            });

            if (!user) {
              console.warn('[payments/callback] User not found for notification:', inv.userId);
              return;
            }

            // Get exam information if one-time payment
            let examTitle: string | null = null;
            if (inv.kind === 'one-time' && inv.examId) {
              const exam = await prisma.exam.findUnique({
                where: { id: inv.examId },
                select: { title: true },
              });
              examTitle = exam?.title ?? null;
            }

            // Send notification
            await sendPaymentNotification({
              userId: inv.userId,
              telegramId: user.telegramId,
              firstName: user.firstName,
              username: user.username,
              kind: inv.kind as 'one-time' | 'subscription',
              amountTiyin: inv.amountTiyin,
              mcUuid: updateData.mcUuid ?? inv.mcUuid,
              examTitle,
              subscriptionEndsAt,
            });
          } catch (notifErr) {
            console.error('[payments/callback] Notification failed:', notifErr);
            // Don't throw - payment is already processed
          }
        })();
      }
    } catch (err) {
      console.error('[payments/callback] update failed', err);
    }
  }

  res.status(200).send('ok');
});

/**
 * GET /payments/status?invoiceId=...
 * Returns { status, kind, examId, belongsToUser, alreadyConsumed } and when paid: receiptUrl, amountTiyin, subscriptionEndsAt (for subscription).
 */
router.get('/status', async (req: Request, res: Response) => {
  const invoiceId = typeof req.query?.invoiceId === 'string' ? req.query.invoiceId.trim() : '';
  if (!invoiceId) {
    return res.status(400).json({ ok: false, reasonCode: 'INVALID_INVOICE' });
  }

  const userId = (req as Request & { user?: { id: string } }).user?.id;
  const guestSessionId = req.cookies?.['guest-session-id'] || req.header('x-guest-session-id') || null;

  const inv = await prisma.paymentInvoice.findUnique({
    where: { invoiceId },
    select: {
      status: true,
      kind: true,
      examId: true,
      amountTiyin: true,
      mcUuid: true,
      userId: true,
      guestSessionId: true,
      paidAt: true,
    },
  });
  if (!inv) {
    return res.status(404).json({ ok: false, reasonCode: 'NOT_FOUND' });
  }

  // Check if invoice is in legacy format (created before guestSessionId support)
  // Legacy: no guestSessionId AND (
  //   - no userId at all (completely empty invoice)
  //   - OR has userId but current user is guest (no userId, has guestSessionId) - guest can't access userId-based invoices
  //   - OR has userId but current user is unauthenticated browser (no userId, no guestSessionId) - can't verify ownership
  // )
  const isLegacyFormat: boolean = Boolean(
    inv.guestSessionId === null && (
      inv.userId === null || 
      (!userId && inv.userId !== null)
    )
  );

  // Check if one-time access was already consumed
  // Only check if payment belongs to current user/session (security)
  let alreadyConsumed = false;
  if (inv.kind === 'one-time' && inv.examId && inv.status === 'paid') {
    // Only check if payment belongs to current user/session
    const belongsToCurrentUser =
      (userId && inv.userId === userId) ||
      (guestSessionId && inv.guestSessionId === guestSessionId);
    
    if (belongsToCurrentUser && inv.paidAt) {
      // Find OneTimeAccess created around the time of payment (within 5 seconds)
      // This matches the OneTimeAccess that was created for this specific invoice
      const paymentTime = inv.paidAt;
      const timeWindowStart = new Date(paymentTime.getTime() - 5000); // 5 seconds before
      const timeWindowEnd = new Date(paymentTime.getTime() + 5000); // 5 seconds after
      
      const whereClause: {
        examId: string;
        consumedAt: { not: null };
        createdAt: { gte: Date; lte: Date };
        userId?: string | null;
        guestSessionId?: string | null;
      } = {
        examId: inv.examId,
        consumedAt: { not: null },
        createdAt: {
          gte: timeWindowStart,
          lte: timeWindowEnd,
        },
      };
      
      // Use invoice user/session (the one that created the OneTimeAccess)
      if (inv.userId) {
        whereClause.userId = inv.userId;
      } else if (inv.guestSessionId) {
        whereClause.guestSessionId = inv.guestSessionId;
      }
      
      // Only check if invoice has user/session identifier
      if (whereClause.userId || whereClause.guestSessionId) {
        const oneTime = await prisma.oneTimeAccess.findFirst({
          where: whereClause,
          select: { id: true },
        });
        alreadyConsumed = Boolean(oneTime);
      }
    }
  }

  // Check if invoice belongs to current user/session
  const belongsToUser =
    (userId && inv.userId === userId) ||
    (guestSessionId && inv.guestSessionId === guestSessionId);

  const payload: {
    ok: boolean;
    status: string;
    kind?: string;
    examId?: string | null;
    belongsToUser: boolean;
    alreadyConsumed: boolean;
    isLegacyFormat?: boolean;
    receiptUrl?: string;
    amountTiyin?: number;
    subscriptionEndsAt?: string | null;
  } = {
    ok: true,
    status: inv.status,
    kind: inv.kind,
    examId: inv.examId,
    belongsToUser: isLegacyFormat ? false : belongsToUser,
    alreadyConsumed,
    isLegacyFormat,
  };

  if (inv.status === 'paid') {
    if (inv.mcUuid) {
      payload.receiptUrl = `https://checkout.multicard.uz/check/${inv.mcUuid}`;
    }
    payload.amountTiyin = inv.amountTiyin;
    if (inv.kind === 'subscription' && inv.userId) {
      const sub = await prisma.userSubscription.findFirst({
        where: { userId: inv.userId },
        orderBy: { endsAt: 'desc' },
        select: { endsAt: true },
      });
      payload.subscriptionEndsAt = sub?.endsAt?.toISOString() ?? null;
    }
  }

  return res.json(payload);
});

export default router;
