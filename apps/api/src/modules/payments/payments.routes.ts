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

  if (!userId) {
    return res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
  }

  if (!ps) {
    console.error('[payments/create] Invalid paymentSystem:', { raw: req.body?.paymentSystem, psRaw, ps, available: Object.keys(PS_MAP) });
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
    console.log('[payments/create] Creating payment:', { psRaw, ps, invoiceId, kind });
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
        userId,
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
        select: { id: true, kind: true, userId: true, examId: true, status: true },
      });
      if (inv && inv.status !== 'paid') {
        await prisma.paymentInvoice.update({
          where: { invoiceId },
          data: { status: 'paid', paidAt: new Date() },
        });
        const settings = await getAccessSettings();
        if (inv.kind === 'one-time' && inv.examId) {
          await prisma.oneTimeAccess.create({
            data: { userId: inv.userId, examId: inv.examId },
          });
        } else if (inv.kind === 'subscription') {
          const now = new Date();
          const endsAt = new Date(now);
          endsAt.setDate(endsAt.getDate() + settings.subscriptionDurationDays);
          await prisma.userSubscription.create({
            data: {
              userId: inv.userId,
              endsAt,
              status: 'ACTIVE',
            },
          });
        }
      }
    } catch (err) {
      console.error('[payments/callback] update failed', err);
    }
  }

  res.status(200).send('ok');
});

/**
 * GET /payments/status/:invoiceId
 * Returns { status: 'created' | 'paid' } for polling after redirect.
 */
router.get('/status/:invoiceId', async (req: Request, res: Response) => {
  const raw = req.params.invoiceId;
  const invoiceId = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? raw[0]?.trim() ?? '' : '';
  if (!invoiceId) {
    return res.status(400).json({ ok: false, reasonCode: 'INVALID_INVOICE' });
  }

  const inv = await prisma.paymentInvoice.findUnique({
    where: { invoiceId },
    select: { status: true, kind: true, examId: true },
  });
  if (!inv) {
    return res.status(404).json({ ok: false, reasonCode: 'NOT_FOUND' });
  }

  return res.json({
    ok: true,
    status: inv.status,
    kind: inv.kind,
    examId: inv.examId,
  });
});

export default router;
