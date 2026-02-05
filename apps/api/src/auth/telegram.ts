import crypto from 'crypto';

export interface TelegramUser {
  telegramId: string;
  firstName?: string;
  username?: string;
}

/** Payload from Telegram Login Widget callback (id, first_name, auth_date, hash, ...). */
export interface TelegramWidgetAuthPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string
): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');

  return calculatedHash === hash;
}

export function parseTelegramUser(initData: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const userRaw = params.get('user');
  if (!userRaw) return null;

  try {
    const user = JSON.parse(userRaw) as {
      id: number;
      first_name?: string;
      username?: string;
    };
    return {
      telegramId: String(user.id),
      firstName: user.first_name,
      username: user.username,
    };
  } catch {
    return null;
  }
}

const WIDGET_AUTH_MAX_AGE_SEC = 24 * 60 * 60; // 24 hours

/**
 * Verifies Telegram Login Widget callback payload (hash + optional auth_date).
 * secret_key = SHA256(bot_token); hash = HMAC-SHA256(dataCheckString, secret_key).
 */
export function verifyTelegramWidgetAuth(
  payload: TelegramWidgetAuthPayload,
  botToken: string
): boolean {
  const { hash, ...rest } = payload;
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${(rest as Record<string, unknown>)[k]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (calculatedHash !== hash) return false;

  const now = Math.floor(Date.now() / 1000);
  if (now - payload.auth_date > WIDGET_AUTH_MAX_AGE_SEC) return false;

  return true;
}

/**
 * Extracts TelegramUser from Login Widget payload (for upsert and response).
 */
export function parseTelegramUserFromWidget(
  payload: TelegramWidgetAuthPayload
): TelegramUser {
  return {
    telegramId: String(payload.id),
    firstName: payload.first_name,
    username: payload.username,
  };
}
