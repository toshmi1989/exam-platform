import { API_BASE_URL } from '../../../lib/api/config';

/** Проксирует POST на бэкенд, передаёт x-telegram-id (same-origin, без CORS). */
export async function POST(request: Request) {
  const telegramId = request.headers.get('x-telegram-id') ?? '';
  const res = await fetch(`${API_BASE_URL}/accept-agreement`, {
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
}
