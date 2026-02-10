# Degradation monitor (cron)

The script `apps/api/src/scripts/check-degradation.ts` compiles to `dist/scripts/check-degradation.js`. It collects:

- **Load** (from `/proc/loadavg`): WARNING if load > cores × 1.5, CRITICAL if > cores × 2.5
- **Memory** (from `free -m`): WARNING if used > 80%, CRITICAL if > 90%
- **Disk** (from `df -h /`): WARNING if used > 85%, CRITICAL if > 95%
- **PM2 restarts** (from `pm2 jlist`): WARNING when `restart_time` increased for exam-api, exam-web, or ziyoda-bot

It does **not** restart any services. It only sends Telegram alerts via `notifyAdmins()` when a metric degrades or recovers. State is stored in `/var/tmp/ziyomed-monitor-state.json` so alerts are sent only when state **changes** (no spam).

## Cron example (every 2 minutes)

From the API app directory (env is loaded from `apps/api/.env`):

```cron
*/2 * * * * cd /opt/exam/exam-platform/apps/api && node dist/scripts/check-degradation.js >> /var/log/check-degradation.log 2>&1
```

Or with env in crontab:

```cron
*/2 * * * * TELEGRAM_BOT_TOKEN=your_token ADMIN_TELEGRAM_IDS=123,456 node /opt/exam/exam-platform/apps/api/dist/scripts/check-degradation.js >> /var/log/check-degradation.log 2>&1
```

Ensure `TELEGRAM_BOT_TOKEN` and `ADMIN_TELEGRAM_IDS` are set. Optional: `MONITOR_HOST_NAME` (default `ziyomed.com`) for the "Host" field in alerts.
