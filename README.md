# Exam Platform

Платформа экзаменов: тесты и устные экзамены с AI-объяснениями (Зиёда). API (Express + Prisma), веб-клиент (Next.js), Telegram Mini App.

**Репозиторий:** https://github.com/toshmi1989/exam-platform

---

## GitHub

### Клонирование

```bash
git clone https://github.com/toshmi1989/exam-platform.git
cd exam-platform
```

### Отправка изменений в GitHub

```bash
git status
git add .
git commit -m "описание изменений"
git push origin main
```

Если ветка называется иначе (например `master`):

```bash
git push origin master
```

### Первая настройка remote (если клонировали не с GitHub)

```bash
git remote add origin https://github.com/toshmi1989/exam-platform.git
git branch -M main
git push -u origin main
```

---

## Команды для сервера

Краткий справочник. Полная инструкция по деплою: [docs/deployment-linux.md](docs/deployment-linux.md).

### Обновление после `git pull`

```bash
cd /home/app/exam-platform   # или ваш путь к проекту
git pull

# API
cd apps/api && npm ci && npm run build && cd ../..

# Web
cd apps/web && npm ci && npm run build && cd ../..

# Миграции (если появились новые)
cd apps/api && npx prisma migrate deploy && npx prisma generate && cd ../..

pm2 restart all
```

### PM2

```bash
pm2 start ecosystem.config.cjs   # первый запуск
pm2 save
pm2 startup                       # автозапуск после перезагрузки

pm2 status
pm2 logs
pm2 logs exam-api
pm2 logs exam-web
pm2 restart exam-api
pm2 restart exam-web
pm2 restart all
```

### База данных

```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate
npx prisma studio                 # UI для просмотра БД (опционально)
```

### Переменные окружения

- **API:** `apps/api/.env` — `DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, `OPENAI_API_KEY`, Multicard, `FRONTEND_URL`, `API_PUBLIC_URL`.
- **Web:** при сборке нужен `NEXT_PUBLIC_API_BASE_URL` (в `.env.production` или `.env.local`).

Подробный список и примеры — в [docs/deployment-linux.md](docs/deployment-linux.md#6-переменные-окружения).

---

## Локальная разработка

```bash
# API
cd apps/api && npm ci && npm run dev

# Web (в другом терминале)
cd apps/web && npm ci && npm run dev
```

API: http://localhost:3001, Web: http://localhost:3000. Для API нужна PostgreSQL и `apps/api/.env` с `DATABASE_URL`.
