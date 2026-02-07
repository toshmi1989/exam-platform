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
    if (res.ok) {
      return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    try {
      const j = JSON.parse(text) as { error?: string };
      return new Response(JSON.stringify({ ok: false, error: (j?.error ?? text) || 'Ошибка API' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ ok: false, error: text || 'Ошибка API' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (e) {
    console.error('[api/admin/ziyoda-prompts GET]', e);
    const msg =
      e && typeof e === 'object' && 'message' in e && typeof (e as { message: string }).message === 'string'
        ? (e as { message: string }).message
        : 'Сервер не смог связаться с API. Проверьте API_INTERNAL_URL или NEXT_PUBLIC_API_BASE_URL.';
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
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
    let errorBody = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (res.status >= 400 && j?.error) errorBody = JSON.stringify({ ok: false, error: j.error });
    } catch {
      if (res.status >= 400) errorBody = JSON.stringify({ ok: false, error: text || 'Ошибка API' });
    }
    return new Response(res.ok ? text : errorBody, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[api/admin/ziyoda-prompts PUT]', e);
    const msg =
      e && typeof e === 'object' && 'message' in e && typeof (e as { message: string }).message === 'string'
        ? (e as { message: string }).message
        : 'Сервер не смог связаться с API. Проверьте API_INTERNAL_URL или NEXT_PUBLIC_API_BASE_URL.';
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
