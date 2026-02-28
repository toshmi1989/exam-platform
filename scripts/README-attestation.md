# Attestation parser (parser_attestation.py)

Парсер загружает списки аттестаций с tmbm.ssv.uz в таблицу `attestation_people`.

## Зависимости Python

На сервере, где запускается API (и при первой пустой БД вызывается парсер), установите зависимости.

Если `pip3` ещё нет (например, Ubuntu/Debian):

```bash
sudo apt update && sudo apt install -y python3-pip
```

Затем из корня репозитория:

```bash
pip3 install -r scripts/requirements-attestation.txt
```

Или в пользовательский каталог (без sudo):

```bash
pip3 install --user -r scripts/requirements-attestation.txt
```

Нужны пакеты: `requests`, `beautifulsoup4`, `psycopg2-binary`.

## Переменные окружения

- `DATABASE_URL` — строка подключения к PostgreSQL (та же, что для приложения).

## Запуск вручную

Из корня репозитория:

```bash
python3 scripts/parser_attestation.py
```

Рекомендуется также настроить cron на ежедневный запуск в 06:00 для обновления данных.
