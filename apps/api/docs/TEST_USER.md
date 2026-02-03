# Тестовый пользователь с подпиской (локальная разработка)

Чтобы запускать тесты и проверять логику ограничений без оплаты:

## Вариант 1: ID по умолчанию (123456)

1. В каталоге **apps/api** выполните:
   ```bash
   npm run seed:test-user
   ```
2. Перезапустите API (`npm run dev`).
3. Откройте приложение в браузере и войдите — в dev используется пользователь `123456` с активной подпиской.

## Вариант 2: Свой Telegram ID

1. Узнайте свой Telegram ID (например, через [@userinfobot](https://t.me/userinfobot)).
2. В **apps/api/.env** добавьте (или измените):
   ```env
   DEV_TELEGRAM_ID=ВАШ_TELEGRAM_ID
   ```
   Чтобы заходить в админку тем же пользователем, добавьте этот ID в список:
   ```env
   ADMIN_TELEGRAM_IDS=123456,ВАШ_TELEGRAM_ID
   ```
3. В каталоге **apps/api** выполните команду для своего ID.

   **Windows (PowerShell):**
   ```powershell
   $env:TELEGRAM_ID="2903259"; npm run seed:test-user
   ```
   или задайте только `DEV_TELEGRAM_ID` в .env и запустите:
   ```powershell
   npm run seed:test-user
   ```
   (скрипт возьмёт ID из `DEV_TELEGRAM_ID`.)

   **Linux / macOS (bash):**
   ```bash
   TELEGRAM_ID=ВАШ_TELEGRAM_ID npm run seed:test-user
   ```
4. Перезапустите API.

После этого при открытии приложения в режиме разработки (без продакшн-авторизации Telegram) API будет считать запросы от указанного пользователя, у которого уже есть активная подписка.
