import { API_BASE_URL } from '../../../../../lib/api/config';

const BACKEND_URL =
  (typeof process.env.API_INTERNAL_URL === 'string' && process.env.API_INTERNAL_URL.trim()) ||
  API_BASE_URL;

const BASE = BACKEND_URL.replace(/\/$/, '');

function backendError(text: string, status: number): Response {
  try {
    const j = JSON.parse(text) as { error?: string };
    return new Response(
      JSON.stringify({ ok: false, error: (j?.error ?? text) || 'Ошибка API' }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(JSON.stringify({ ok: false, error: text || 'Ошибка API' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function proxyError(e: unknown): Response {
  const msg =
    e && typeof e === 'object' && 'message' in e && typeof (e as { message: string }).message === 'string'
      ? (e as { message: string }).message
      : 'Сервер не смог связаться с API. Проверьте API_INTERNAL_URL или NEXT_PUBLIC_API_BASE_URL.';
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Прокси GET/POST на бэкенд (same-origin, без CORS). */
export async function GET(request: Request) {
  const telegramId = request.headers.get('x-telegram-id') ?? '';
  try {
    const res = await fetch(`${BASE}/admin/settings/access`, {
      method: 'GET',
      headers: { 'x-telegram-id': telegramId },
    });
    const text = await res.text();
    if (res.ok) return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    return backendError(text, res.status);
  } catch (e) {
    console.error('[api/admin/settings/access GET]', e);
    return proxyError(e);
  }
}

export async function POST(request: Request) {
  const telegramId = request.headers.get('x-telegram-id') ?? '';
  let body: string;
  try {
    body = await request.text();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Неверное тело запроса.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const res = await fetch(`${BASE}/admin/settings/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-id': telegramId,
      },
      body,
    });
    const text = await res.text();
    if (res.ok) return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    return backendError(text, res.status);
  } catch (e) {
    console.error('[api/admin/settings/access POST]', e);
    return proxyError(e);
  }
}
