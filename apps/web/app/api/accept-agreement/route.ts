import { API_BASE_URL } from '../../../lib/api/config';

/** URL бэкенда при вызове с сервера (чтобы не идти через Nginx). На сервере задайте API_INTERNAL_URL=http://127.0.0.1:3001 */
const BACKEND_URL =
  (typeof process.env.API_INTERNAL_URL === 'string' && process.env.API_INTERNAL_URL.trim()) ||
  API_BASE_URL;

/** Проксирует POST на бэкенд, передаёт x-telegram-id (same-origin, без CORS). */
export async function POST(request: Request) {
  const telegramId = request.headers.get('x-telegram-id') ?? '';
  try {
    const res = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/accept-agreement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-id': telegramId,
      },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[accept-agreement proxy]', e);
    return new Response(
      JSON.stringify({
        ok: false,
        reasonCode: 'PROXY_ERROR',
        message: 'Сервер не смог связаться с API. Проверьте API_INTERNAL_URL и что бэкенд запущен.',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
