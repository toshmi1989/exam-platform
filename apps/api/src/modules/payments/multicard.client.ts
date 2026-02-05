/**
 * Multicard payment gateway client.
 * Based on .cursor/docs/payment-reference/multicard_client.py
 */

import crypto from 'crypto';

const BASE_URL = (process.env.MULTICARD_BASE_URL ?? 'https://mesh.multicard.uz').replace(/\/$/, '');
const APPLICATION_ID = (process.env.MULTICARD_APPLICATION_ID ?? '').trim();
const SECRET = (process.env.MULTICARD_SECRET ?? '').trim();
const STORE_ID = parseInt(process.env.MULTICARD_STORE_ID ?? '0', 10);

const AUTH_URL = `${BASE_URL}/auth`;
const PAYMENT_URL = `${BASE_URL}/payment`;

let authCache: { token: string | null; expiresAt: number } = {
  token: null,
  expiresAt: 0,
};

function parseExpiredAt(value: string | null | undefined): number {
  if (!value) return 0;
  try {
    const date = new Date(value.replace(' ', 'T'));
    return date.getTime() / 1000;
  } catch {
    return 0;
  }
}

async function getToken(force = false): Promise<string> {
  const now = Date.now() / 1000;
  if (
    !force &&
    authCache.token &&
    authCache.expiresAt - 15 > now
  ) {
    return authCache.token;
  }

  const resp = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      application_id: APPLICATION_ID,
      secret: SECRET,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error('[Multicard] auth failed', resp.status, text);
    throw new Error(`Multicard auth failed: ${resp.status}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const token = (data.access_token ?? data.token) as string | undefined;
  const expiresAt = parseExpiredAt(data.expired_at as string | undefined);

  if (!token) {
    throw new Error(`Invalid Multicard auth response: ${JSON.stringify(data)}`);
  }

  authCache = {
    token,
    expiresAt: expiresAt || now + 600,
  };
  return token;
}

export interface CreatePaymentParams {
  amount: number;       // tiyin
  invoiceId: string;
  paymentSystem: string;
  returnUrl: string;
  callbackUrl: string;
  lang?: string;
  billingId?: string;
}

export interface CreatePaymentResult {
  checkout_url?: string;
  check_url?: string;
  redirect_url?: string;
  payment_url?: string;
  url?: string;
  link?: string;
  uuid?: string;
  [key: string]: unknown;
}

/** Get redirect URL from Multicard payment response (different PS may use different keys). */
export function getPaymentRedirectUrl(payment: CreatePaymentResult): string | undefined {
  const raw =
    payment.checkout_url ??
    payment.check_url ??
    payment.redirect_url ??
    payment.payment_url ??
    payment.url ??
    payment.link;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

export async function createMulticardPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
  const token = await getToken();
  const payload = {
    store_id: STORE_ID,
    amount: params.amount,
    invoice_id: params.invoiceId,
    payment_system: params.paymentSystem,
    return_url: params.returnUrl,
    callback_url: params.callbackUrl,
    lang: params.lang ?? 'ru',
    details: { invoice_id: params.invoiceId },
    ...(params.billingId ? { billing_id: params.billingId } : {}),
  };

  console.log('[Multicard] Sending payload:', JSON.stringify(payload, null, 2));

  let resp = await fetch(PAYMENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (resp.status === 401) {
    const newToken = await getToken(true);
    resp = await fetch(PAYMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Multicard payment error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  if (typeof data.success === 'boolean' && data.success === false) {
    throw new Error(`Multicard rejected payment: ${JSON.stringify(data)}`);
  }
  if (data.success === true && data.data) {
    return data.data as CreatePaymentResult;
  }
  return data as CreatePaymentResult;
}

export async function getMulticardPaymentInfo(paymentUuid: string): Promise<Record<string, unknown>> {
  if (!paymentUuid) throw new Error('payment_uuid is empty');
  const token = await getToken();
  const url = `${BASE_URL}/payment/${paymentUuid}`;
  let resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (resp.status === 401) {
    const newToken = await getToken(true);
    resp = await fetch(url, {
      headers: { Authorization: `Bearer ${newToken}`, Accept: 'application/json' },
    });
  }
  if (!resp.ok) throw new Error(`Multicard get payment failed: ${resp.status}`);
  return (await resp.json()) as Record<string, unknown>;
}

/**
 * Verify callback sign: sorted key=value&... + secret, then MD5.
 * From multicard_client.py verify_callback_sign_payload.
 */
export function verifyCallbackSignPayload(payload: Record<string, unknown>, secret: string): boolean {
  const gotSign = String(payload?.sign ?? '').trim().toLowerCase();
  if (!gotSign || !secret) return false;

  const data: Record<string, string> = {};
  for (const k of Object.keys(payload)) {
    if (k === 'sign') continue;
    const v = payload[k];
    if (v == null) continue;
    const vStr = String(v).trim();
    if (vStr === '') continue;
    data[k] = vStr;
  }
  const parts = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`);
  const base = parts.join('&') + secret;
  const md5 = crypto.createHash('md5').update(base, 'utf8').digest('hex').toLowerCase();
  return md5 === gotSign;
}

/**
 * Alternative sign: fixed field order, concatenate values + secret, then MD5 or SHA1.
 * From guest_module.py multicard_callback.
 */
const CALLBACK_FIELDS_ORDER = [
  'store_id', 'amount', 'invoice_id', 'invoice_uuid', 'billing_id',
  'payment_time', 'phone', 'card_pan', 'card_token', 'ps', 'uuid', 'receipt_url',
];

export function verifyCallbackSignFixedOrder(payload: Record<string, unknown>, secret: string): boolean {
  const gotSign = String(payload?.sign ?? '').trim().toLowerCase();
  if (!gotSign || !secret) return false;

  const values = CALLBACK_FIELDS_ORDER.map((k) => {
    const v = payload[k];
    return v == null ? '' : String(v);
  });
  const base = values.join('') + secret;
  const md5 = crypto.createHash('md5').update(base, 'utf8').digest('hex').toLowerCase();
  const sha1 = crypto.createHash('sha1').update(base, 'utf8').digest('hex').toLowerCase();
  return gotSign === md5 || gotSign === sha1;
}

export function isMulticardConfigured(): boolean {
  return Boolean(APPLICATION_ID && SECRET && STORE_ID);
}
