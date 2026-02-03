import { API_BASE_URL } from '../../../../lib/api/config';

export async function POST(request: Request) {
  const body = await request.json();
  const initData = body?.initData as string | undefined;

  const res = await fetch(`${API_BASE_URL}/auth/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
