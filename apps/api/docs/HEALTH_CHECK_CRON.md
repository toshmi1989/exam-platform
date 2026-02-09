# Health check watchdog (cron)

The script `apps/api/src/scripts/check-health.ts` compiles to `dist/scripts/check-health.js`. It checks:

- https://ziyomed.com
- https://api.ziyomed.com
- http://127.0.0.1:3000
- http://127.0.0.1:3001

If any request fails (timeout or non-2xx), it sends an alert to all `ADMIN_TELEGRAM_IDS` via the Telegram bot. It does **not** restart anything.

## Cron example (every 2 minutes)

From the API app directory (env is loaded from `apps/api/.env`):

```cron
*/2 * * * * cd /opt/exam/exam-platform/apps/api && node dist/scripts/check-health.js >> /var/log/check-health.log 2>&1
```

Or deploy the compiled script to `/opt/monitor` and set env in crontab:

```cron
*/2 * * * * TELEGRAM_BOT_TOKEN=your_token ADMIN_TELEGRAM_IDS=123,456 node /opt/monitor/check-health.js >> /var/log/check-health.log 2>&1
```

Ensure `TELEGRAM_BOT_TOKEN` and `ADMIN_TELEGRAM_IDS` are set (in `.env` or in the cron line).
