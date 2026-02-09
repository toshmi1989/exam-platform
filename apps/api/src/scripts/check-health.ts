/**
 * Health watchdog: checks URLs every run. On any failure, notifies admins via Telegram.
 * Do NOT auto-restart; only alert.
 *
 * Run every 2 minutes via cron, e.g.:
 *   */2 * * * * cd /opt/exam/exam-platform/apps/api && node dist/scripts/check-health.js >> /var/log/check-health.log 2>&1
 *
 * Or deploy to /opt/monitor and set env:
 *   */2 * * * * TELEGRAM_BOT_TOKEN=... ADMIN_TELEGRAM_IDS=... node /opt/monitor/check-health.js
 */

import * as fs from 'fs';
import * as path from 'path';

function loadEnv(): void {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
        }
      }
      return;
    }
  }
}

loadEnv();

import { notifyAdmins } from '../modules/ops/serverNotifier';

const CHECK_TIMEOUT_MS = 12000;

const ENDPOINTS: { name: string; url: string }[] = [
  { name: 'ziyomed.com', url: 'https://ziyomed.com' },
  { name: 'api.ziyomed.com', url: 'https://api.ziyomed.com' },
  { name: 'localhost:3000', url: 'http://127.0.0.1:3000' },
  { name: 'localhost:3001', url: 'http://127.0.0.1:3001' },
];

async function checkUrl(name: string, url: string): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'ZiyoMed-HealthCheck/1.0' },
    });
    clearTimeout(timeout);
    if (res.ok) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.slice(0, 200) };
  }
}

async function main(): Promise<void> {
  for (const { name, url } of ENDPOINTS) {
    const result = await checkUrl(name, url);
    if (!result.ok) {
      const body = `${name} DOWN\n${url}\n${result.error ?? 'Unknown error'}`;
      await notifyAdmins(body);
    }
  }
}

main().catch((err) => {
  console.error('check-health:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
