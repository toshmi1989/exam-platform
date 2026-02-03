import { API_BASE_URL } from './config';
import { readTelegramUser } from '../telegramUser';

type ApiOptions = RequestInit & {
  json?: Record<string, unknown> | null;
};

export async function apiFetch(path: string, options: ApiOptions = {}) {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (typeof window !== 'undefined') {
    const user = readTelegramUser();
    if (user?.telegramId) {
      headers.set('x-telegram-id', user.telegramId);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.json ? JSON.stringify(options.json) : options.body,
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { response, data };
}
