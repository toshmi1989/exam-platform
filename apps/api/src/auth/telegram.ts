import crypto from 'crypto';

export interface TelegramUser {
  telegramId: string;
  firstName?: string;
  username?: string;
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
