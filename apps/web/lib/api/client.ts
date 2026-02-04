import { API_BASE_URL } from './config';
import { readTelegramUser } from '../telegramUser';

const DEFAULT_TIMEOUT_MS = 30_000;

type ApiOptions = RequestInit & {
  json?: Record<string, unknown> | null;
  timeoutMs?: number;
};

export async function apiFetch(path: string, options: ApiOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  if (typeof window !== 'undefined') {
    const user = readTelegramUser();
    if (user?.telegramId) {
      headers.set('x-telegram-id', user.telegramId);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      body: options.json ? JSON.stringify(options.json) : init.body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
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
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw err;
  }
}
