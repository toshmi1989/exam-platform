# Пошаговый деплой проекта Exam Platform на Linux-сервер

Инструкция для деплоя монорепозитория (API + Web) на сервер с Ubuntu 22.04 LTS (или аналогичный Debian-based). Используются: Node.js, PostgreSQL, Nginx, PM2.

---

## Оглавление

1. [Подготовка сервера](#1-подготовка-сервера)
2. [Установка Node.js](#2-установка-nodejs)
3. [Установка PostgreSQL](#3-установка-postgresql)
4. [Клонирование проекта и установка зависимостей](#4-клонирование-проекта-и-установка-зависимостей)
5. [Сборка API (TypeScript)](#5-сборка-api-typescript)
6. [Переменные окружения](#6-переменные-окружения)
7. [База данных и миграции](#7-база-данных-и-миграции)
8. [Сборка фронтенда (Next.js)](#8-сборка-фронтенда-nextjs)
9. [PM2: запуск и автозапуск](#9-pm2-запуск-и-автозапуск)
10. [Установка и настройка Nginx](#10-установка-и-настройка-nginx)
11. [HTTPS (Let's Encrypt)](#11-https-lets-encrypt)
12. [Проверка и полезные команды](#12-проверка-и-полезные-команды)

---

## 1. Подготовка сервера

Обновите систему и установите базовые пакеты:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential
```

Создайте пользователя для приложения (опционально, но рекомендуется):

```bash
sudo adduser --disabled-password --gecos "" app
# Пароль не задаём; доступ по SSH — по ключу
```

Домашняя директория приложения далее: `/home/app/exam-platform` (или `~/exam-platform` под вашим пользователем).

---

## 2. Установка Node.js

Рекомендуется Node.js 20 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x.x
npm -v
```

Либо через nvm (для пользователя `app`):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

---

## 3. Установка PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Создайте базу и пользователя:

```bash
sudo -u postgres psql -c "CREATE USER exam_user WITH PASSWORD 'ваш_надёжный_пароль';"
sudo -u postgres psql -c "CREATE DATABASE exam OWNER exam_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE exam TO exam_user;"
```

Проверка:

```bash
sudo -u postgres psql -d exam -c "\conninfo"
```

Запомните строку подключения (она понадобится для API):

```
postgresql://exam_user:ваш_надёжный_пароль@localhost:5432/exam
```

---

## 4. Клонирование проекта и установка зависимостей

```bash
cd /home/app   # или ваш каталог
git clone https://github.com/ВАШ_РЕПО/exam-platform.git
cd exam-platform
```

Установка зависимостей для API и Web:

```bash
cd apps/api && npm ci && cd ../..
cd apps/web && npm ci && cd ../..
```

(Если нет `package-lock.json`, используйте `npm install`.)

---

## 5. Сборка API (TypeScript)

API нужно скомпилировать в JavaScript для production. Добавьте в `apps/api/package.json` скрипты и настройте вывод TypeScript.

**Вариант A: отдельный tsconfig для сборки**

Создайте файл `apps/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false
  },
  "include": ["src"]
}
```

В `apps/api/package.json` в секцию `"scripts"` добавьте:

```json
"build": "prisma generate && tsc -p tsconfig.build.json",
"start": "node dist/index.js"
```

Установите TypeScript в API, если его нет в dependencies:

```bash
cd apps/api && npm install -D typescript && cd ../..
```

Сборка:

```bash
cd apps/api
npm run build
# Должна появиться папка dist/
cd ../..
```

**Вариант B: запуск через ts-node (без сборки)**

Если не хотите настраивать tsc, можно в production запускать так (медленнее старт):

```bash
cd apps/api
npx prisma generate
NODE_ENV=production node -r ts-node/register -r tsconfig-paths/register src/index.ts
```

В инструкции ниже предполагается **Вариант A** (сборка в `dist/` и `npm run start`).

---

## 6. Переменные окружения

### 6.1 API (`apps/api/.env`)

Создайте файл в корне API:

```bash
nano apps/api/.env
```

Заполните (значения замените на свои):

```env
# База данных
DATABASE_URL="postgresql://exam_user:ваш_надёжный_пароль@localhost:5432/exam"

# Сервер
NODE_ENV=production
PORT=3001

# CORS (публичный URL фронтенда без слэша в конце)
CORS_ORIGIN=https://ваш-домен.ru

# Telegram
TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather
ADMIN_TELEGRAM_IDS=123456789,987654321

# Multicard (оплата)
MULTICARD_BASE_URL=https://mesh.multicard.uz
MULTICARD_APPLICATION_ID=ваш_application_id
MULTICARD_SECRET=ваш_секрет
MULTICARD_STORE_ID=ваш_store_id

# Публичные URL для редиректов и колбэков (обязательно HTTPS)
FRONTEND_URL=https://ваш-домен.ru
API_PUBLIC_URL=https://api.ваш-домен.ru
```

- `FRONTEND_URL` — тот же домен, что откроется у пользователя (например Mini App в Telegram).
- `API_PUBLIC_URL` — публичный URL API (Nginx будет проксировать на него; см. ниже).

Файл не должен попадать в git:

```bash
echo "apps/api/.env" >> .gitignore
```

### 6.2 Web (`apps/web/.env.production` или `.env.local`)

Для сборки Next.js нужны публичные URL:

```bash
nano apps/web/.env.production
```

Содержимое:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.ваш-домен.ru
# URL фронта без слэша в конце — без него в Telegram Mini App не грузятся иконки оплаты
NEXT_PUBLIC_APP_URL=https://ваш-домен.ru
```

Либо те же переменные задайте в `.env.local` перед `npm run build`.

---

## 7. База данных и миграции

База данных (PostgreSQL) живёт **отдельно от кода**: она на сервере (или на отдельном хосте), к ней обращается приложение по строке `DATABASE_URL` из `.env`. **При пересборке проекта (git pull, npm run build, pm2 restart) база не пересоздаётся и не очищается** — меняется только код приложения. Данные удаляются только если вы явно выполните что-то вроде `prisma migrate reset` или удалите БД вручную.

Один раз примените миграции Prisma:

```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate
cd ../..
```

При необходимости создайте начальные данные (например, AccessSettings) через seed или вручную в БД.

### 7.1 Перенос подписчиков из старого проекта (Telegram ID)

Если у вас уже есть база подписчиков с Telegram ID (из другого бота/проекта), их можно перенести в этот проект.

1. **Экспорт из старого проекта**  
   Сохраните подписчиков в CSV с колонками: `telegram_id`, `first_name`, `username` (заголовок в первой строке). Пример:

   ```csv
   telegram_id,first_name,username
   123456789,Иван,ivan_user
   987654321,Мария,
   ```

2. **Импорт в этот проект**  
   На сервере (или локально, с указанием `DATABASE_URL` на нужную БД):

   ```bash
   cd /opt/exam/exam-platform/apps/api
   npm run import:subscribers -- /path/to/subscribers.csv
   ```

   Скрипт делает upsert по `telegram_id`: существующие пользователи обновляются (имя, username), новые — создаются. Подписки (UserSubscription) этим скриптом не создаются; при необходимости их можно выдать через админку или отдельный скрипт.

   Если в CSV другой разделитель (например, точка с запятой), задайте переменную окружения:  
   `CSV_DELIMITER=';' npm run import:subscribers -- /path/to/file.csv`

---

## 8. Сборка фронтенда (Next.js)

```bash
cd apps/web
npm run build
cd ../..
```

Убедитесь, что при сборке использовался нужный `NEXT_PUBLIC_API_BASE_URL` (из `.env.production` или `.env.local`).

---

## 9. PM2: запуск и автозапуск

Установка PM2 глобально:

```bash
sudo npm install -g pm2
```

Создайте файл конфигурации PM2 в корне проекта `ecosystem.config.cjs`:

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'exam-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      env_file: './apps/api/.env',
    },
    {
      name: 'exam-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
```

Запуск:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
# Выполните команду, которую выведет pm2 startup (sudo ...)
```

Проверка:

```bash
pm2 status
pm2 logs
```

- API слушает порт **3001** (значение из `apps/api/.env`).
- Web слушает порт **3000**.

---

## 10. Установка и настройка Nginx

Установка Nginx:

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

Создайте конфиг для вашего домена. Ниже пример для:
- фронт: `ваш-домен.ru` (или `app.ваш-домен.ru`);
- API: `api.ваш-домен.ru`.

Файл конфига (подставьте свои домены):

```bash
sudo nano /etc/nginx/sites-available/exam-platform
```

Содержимое (пока без SSL):

```nginx
# Фронтенд (Next.js)
server {
    listen 80;
    server_name ваш-домен.ru www.ваш-домен.ru;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}

# API (Express)
server {
    listen 80;
    server_name api.ваш-домен.ru;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10M;
    }
}
```

Включите сайт и проверьте конфиг:

```bash
sudo ln -s /etc/nginx/sites-available/exam-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

В DNS для сервера должны быть A-записи:
- `ваш-домен.ru` (и при необходимости `www.ваш-домен.ru`) → IP сервера;
- `api.ваш-домен.ru` → IP сервера.

Проверка: откройте в браузере `http://ваш-домен.ru` и `http://api.ваш-домен.ru/health` (должен ответить `{"status":"ok"}`).

---

## 11. HTTPS (Let's Encrypt)

Установка Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Получение сертификатов (Nginx сам подставит конфиг):

```bash
sudo certbot --nginx -d ваш-домен.ru -d www.ваш-домен.ru -d api.ваш-домен.ru
```

Следуйте подсказкам (email, согласие с условиями). Certbot обновит конфиги Nginx для HTTPS и редиректа с HTTP.

Проверка автообновления сертификата:

```bash
sudo certbot renew --dry-run
```

После включения HTTPS в `.env` API и в Next.js должны быть только **https**-URL:
- `CORS_ORIGIN=https://ваш-домен.ru`
- `FRONTEND_URL=https://ваш-домен.ru`
- `API_PUBLIC_URL=https://api.ваш-домен.ru`
- `NEXT_PUBLIC_API_BASE_URL=https://api.ваш-домен.ru`

---

## 12. Проверка и полезные команды

### Проверка

- Фронт: `https://ваш-домен.ru`
- API health: `https://api.ваш-домен.ru/health` → `{"status":"ok"}`
- В BotFather укажите URL Mini App: `https://ваш-домен.ru` (или нужный путь).

### PM2

```bash
pm2 status
pm2 logs exam-api
pm2 logs exam-web
pm2 restart exam-api
pm2 restart exam-web
```

### Обновление проекта после git pull

**Важно:** после `git pull` обязательно пересобрать приложения и перезапустить PM2. Без пересборки сервер продолжит отдавать старый билд — изменений в коде видно не будет.

```bash
cd /opt/exam/exam-platform
git pull origin main

# API
cd apps/api && npm ci && npm run build && cd ../..

# Web (именно build создаёт актуальный билд для next start)
cd apps/web && npm ci && npm run build && cd ../..

# Миграции (если появились новые)
cd apps/api && npx prisma migrate deploy && npx prisma generate && cd ../..

pm2 restart all
```

### Логи

- PM2: `pm2 logs`
- Nginx access: `sudo tail -f /var/log/nginx/access.log`
- Nginx error: `sudo tail -f /var/log/nginx/error.log`

### Резюме портов

| Сервис    | Порт (локально) | Публично              |
|----------|-------------------|------------------------|
| Next.js  | 3000              | https://ваш-домен.ru   |
| Express  | 3001              | https://api.ваш-домен.ru |
| PostgreSQL | 5432            | только localhost       |
| Nginx    | 80, 443           | —                      |

---

Готово. После выполнения всех шагов проект будет работать на Linux за Nginx с HTTPS; API и Web запускаются через PM2 и перезапускаются при перезагрузке сервера (после `pm2 startup`).
