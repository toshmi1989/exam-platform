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

## Выгрузка в CSV

Скрипт `export_attestation.py` выгружает таблицу `attestation_people` в CSV (те же зависимости и `DATABASE_URL`).

Из корня репозитория:

```bash
python3 scripts/export_attestation.py
# по умолчанию создаётся attestation_export.csv

python3 scripts/export_attestation.py -o /path/to/attestation.csv
```

Рекомендуется настроить автозапуск по расписанию (ежедневно в **03:00**).

### Вариант 1: скрипт установки (Linux/macOS)

Из корня репозитория (должен быть файл `.env` с `DATABASE_URL`):

```bash
chmod +x scripts/setup-attestation-cron.sh
./scripts/setup-attestation-cron.sh
```

Скрипт добавит задачу в crontab текущего пользователя. Лог: `/var/log/attestation-parser.log`.

### Вариант 2: вручную

См. пример в `scripts/cron-attestation.example`. Добавьте строку в crontab (`crontab -e`), подставив путь к проекту и `DATABASE_URL`:

```cron
0 3 * * * cd /path/to/exam-platform && export DATABASE_URL='...' && python3 scripts/parser_attestation.py >> /var/log/attestation-parser.log 2>&1
```
