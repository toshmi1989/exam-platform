# Команды для сервера (шпаргалка)

Быстрый справочник команд при работе с проектом на сервере. Полный деплой: [deployment-linux.md](deployment-linux.md).

---

## Обновление проекта

```bash
cd /home/app/exam-platform
git pull

cd apps/api && npm ci && npm run build && cd ../..
cd apps/web && npm ci && npm run build && cd ../..

cd apps/api && npx prisma migrate deploy && npx prisma generate && cd ../..

pm2 restart all
```

**Если после обновления не видно изменений** (например, устный экзамен по‑прежнему «будет доступен позже»): убедитесь, что в `apps/web` сборка прошла без ошибок (`npm run build`), выполните `pm2 restart exam-web`, затем в браузере сделайте жёсткое обновление (**Ctrl+Shift+R**) или откройте сайт в режиме инкогнито.

---

## PM2

| Действие | Команда |
|----------|---------|
| Запуск всех приложений | `pm2 start ecosystem.config.cjs` |
| Сохранить список процессов | `pm2 save` |
| Включить автозапуск при перезагрузке | `pm2 startup` (выполнить выведенную команду с `sudo`) |
| Статус | `pm2 status` |
| Логи всех | `pm2 logs` |
| Логи API | `pm2 logs exam-api` |
| Логи Web | `pm2 logs exam-web` |
| Перезапуск API | `pm2 restart exam-api` |
| Перезапуск Web | `pm2 restart exam-web` |
| Перезапуск всех | `pm2 restart all` |
| Остановить все | `pm2 stop all` |
| Удалить из PM2 | `pm2 delete all` |

---

## База данных (Prisma)

```bash
cd apps/api

# Применить миграции (production)
npx prisma migrate deploy

# Сгенерировать клиент после миграций
npx prisma generate

# Открыть Prisma Studio (просмотр БД)
npx prisma studio
```

---

## Nginx

```bash
# Проверить конфиг
sudo nginx -t

# Перезагрузить конфиг
sudo systemctl reload nginx

# Логи
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Порты (по умолчанию)

| Сервис     | Порт |
|------------|------|
| Next.js    | 3000 |
| API (Express) | 3001 |
| PostgreSQL | 5432 |

---

## Переменные окружения

- **API** — `apps/api/.env` (не коммитить): `DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, `OPENAI_API_KEY`, Multicard, `FRONTEND_URL`, `API_PUBLIC_URL`.
- **Web** — при `npm run build` используется `NEXT_PUBLIC_API_BASE_URL` из `.env.production` или `.env.local`.
