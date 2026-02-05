import { API_BASE_URL } from '../../../../lib/api/config';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const initData = body?.initData as string | undefined;
  const widget = body?.widget as Record<string, unknown> | undefined;

  let url: string;
  let reqBody: string;

  if (widget && typeof widget.id === 'number' && typeof widget.hash === 'string') {
    url = `${API_BASE_URL}/auth/telegram-widget`;
    reqBody = JSON.stringify(widget);
  } else if (initData) {
    url = `${API_BASE_URL}/auth/telegram`;
    reqBody = JSON.stringify({ initData });
  } else {
    return new Response(
      JSON.stringify({ ok: false }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: reqBody,
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
