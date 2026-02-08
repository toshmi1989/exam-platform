# Команды для сервера (шпаргалка)

Быстрый справочник команд при работе с проектом на сервере. Полный деплой: [deployment-linux.md](deployment-linux.md).

---

## Обновление проекта

На сервере используется **npm** (не pnpm). Выполняйте из каталога проекта (например `/opt/exam/exam-platform` или `/home/app/exam-platform`):

```bash
cd /home/app/exam-platform
git pull

cd apps/api && npm ci && npm run build && cd ../..
cd apps/web && npm ci && npm run build && cd ../..

cd apps/api && npx prisma migrate deploy && npx prisma generate && cd ../..

pm2 restart all
```

**Одной строкой** (копировать на сервер целиком):

```bash
cd /home/app/exam-platform && git pull && cd apps/api && npm ci && npm run build && cd ../.. && cd apps/web && npm ci && npm run build && cd ../.. && cd apps/api && npx prisma migrate deploy && npx prisma generate && cd ../.. && pm2 restart all
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
| Перезапуск бота Зиёды | `pm2 restart ziyoda-bot` |
| Логи бота Зиёды | `pm2 logs ziyoda-bot` |
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
- **Ziyoda RAG (бот)** — в том же `apps/api/.env`: `OPENAI_API_KEY` (обязателен для генерации и эмбеддингов). По желанию: `ZIYODA_CHAT_MODEL=gpt-4.1-mini`, `OPENAI_EMBED_MODEL=text-embedding-3-small`.
- **Web** — при `npm run build` используется `NEXT_PUBLIC_API_BASE_URL` из `.env.production` или `.env.local`.

---

## Ziyoda RAG (бот)

- **Запуск бота (процесс в Telegram):** бот — отдельный процесс, получает сообщения и дергает API. После деплоя запустите его через PM2:
  ```bash
  pm2 start ecosystem.config.cjs
  ```
  В `ecosystem.config.cjs` добавлено приложение `ziyoda-bot`. Оно использует те же `apps/api/.env`: `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`. По умолчанию дергает API по `http://127.0.0.1:3001` (переменная `BOT_API_URL` в ecosystem или в .env).
- **Ручной запуск** (если не через PM2):
  ```bash
  cd /opt/exam/exam-platform/apps/api
  node dist/scripts/ziyoda-bot.js
  ```
  Нужны в окружении: `TELEGRAM_BOT_TOKEN`, `BOT_API_URL` (или `API_PUBLIC_URL`, например `http://127.0.0.1:3001`). Чтобы при запросе «начать тест» показывалась кнопка «Открыть ZiyoMed», задайте `FRONTEND_URL` или `PLATFORM_URL` (URL вашей платформы или Mini App).
- Эндпоинт API для бота: **POST** `https://ваш-домен/api/bot/ask` (прокси через Nginx на API, порт 3001). Бот-процесс на том же сервере вызывает `http://127.0.0.1:3001/bot/ask`.
- Тело запроса: `{ "telegramId": "...", "firstName": "Имя", "message": "текст вопроса" }`. Ответ: `{ "answer": "..." }`.
- После деплоя миграция `add_ziyoda_rag_models` применится командой `npx prisma migrate deploy` (она уже в цепочке обновления выше).
- База знаний: в админке → AI → вкладка «Зиёда AI» — загрузка PDF/DOCX/TXT, переиндексация, статистика.
