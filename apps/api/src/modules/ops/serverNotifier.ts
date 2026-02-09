/**
 * Sends server alert messages to all admin Telegram IDs.
 * Uses Telegram Bot API directly. No stack traces or sensitive data.
 */

const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const TELEGRAM_API = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : '';

function getAdminIds(): string[] {
  const raw = (process.env.ADMIN_TELEGRAM_IDS ?? '').trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 min
let lastAlert = 0;

/**
 * Send formatted alert to all admins. Uses HTML parse_mode.
 * Memory cooldown: skips if last alert was less than 5 min ago (anti-spam).
 * Safe to call from health checks or API; never throws.
 */
export async function notifyAdmins(text: string): Promise<void> {
  const now = Date.now();
  if (now - lastAlert < ALERT_COOLDOWN_MS) return;
  lastAlert = now;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_API) {
    console.warn('[serverNotifier] TELEGRAM_BOT_TOKEN not set, skip notify');
    return;
  }
  const adminIds = getAdminIds();
  if (adminIds.length === 0) {
    console.warn('[serverNotifier] ADMIN_TELEGRAM_IDS empty, skip notify');
    return;
  }
  const raw = String(text ?? '').trim().slice(0, 3500);
  const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = `🛑 SERVER ALERT\n\n${escaped}`;
  const url = `${TELEGRAM_API}/sendMessage`;
  for (const chatId of adminIds) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: body,
          parse_mode: 'HTML',
        }),
      });
      if (!res.ok) {
        console.warn('[serverNotifier] send failed', chatId, res.status);
      }
    } catch (err) {
      console.warn('[serverNotifier] send error', chatId, err instanceof Error ? err.message : err);
    }
  }
}
