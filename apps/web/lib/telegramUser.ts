export interface TelegramUserSnapshot {
  telegramId?: string;
  firstName?: string;
  username?: string;
  photoUrl?: string;
  role?: 'admin' | 'authorized';
  isAdmin?: boolean;
}

const STORAGE_KEY = 'calmexam.telegramUser';

export function storeTelegramUser(user: TelegramUserSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    window.dispatchEvent(new Event('telegram-user-changed'));
  } catch {
    // ignore storage errors in private mode
  }
}

export function readTelegramUser(): TelegramUserSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TelegramUserSnapshot;
  } catch {
    return null;
  }
}
