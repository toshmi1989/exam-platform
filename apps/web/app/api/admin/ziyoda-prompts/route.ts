import { API_BASE_URL } from '../../../../lib/api/config';

const BACKEND_URL =
  (typeof process.env.API_INTERNAL_URL === 'string' && process.env.API_INTERNAL_URL.trim()) ||
  API_BASE_URL;

const BASE = BACKEND_URL.replace(/\/$/, '');

/** Прокси GET/PUT на бэкенд (same-origin, без CORS). */
export async function GET(request: Request) {
  const telegramId = request.headers.get('x-telegram-id') ?? '';
  try {
    const res = await fetch(`${BASE}/admin/ziyoda-prompts`, {
      method: 'GET',
      headers: { 'x-telegram-id': telegramId },
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[api/admin/ziyoda-prompts GET]', e);
    return new Response(
      JSON.stringify({ ok: false, error: 'Сервер не смог связаться с API.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function PUT(request: Request) {
  const telegramId = request.headers.get('x-telegram-id') ?? '';
  let body: string;
  try {
    body = await request.text();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'Неверное тело запроса.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  try {
    const res = await fetch(`${BASE}/admin/ziyoda-prompts`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-id': telegramId,
      },
      body,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[api/admin/ziyoda-prompts PUT]', e);
    return new Response(
      JSON.stringify({ ok: false, error: 'Сервер не смог связаться с API.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
