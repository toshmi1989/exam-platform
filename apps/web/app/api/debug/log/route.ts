export async function GET() {
  const payload = {
    sessionId: 'debug-session',
    runId: 'run-telegram',
    hypothesisId: 'H0',
    location: 'app/api/debug/log/route.ts:1',
    message: 'debug GET hit',
    data: {},
    timestamp: Date.now(),
  };

  await fetch('http://127.0.0.1:7242/ingest/4fc32459-9fe7-40db-9541-c82348e3184a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request) {
  const payload = await request.json();

  await fetch('http://127.0.0.1:7242/ingest/4fc32459-9fe7-40db-9541-c82348e3184a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
