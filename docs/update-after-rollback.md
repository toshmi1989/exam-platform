# Обновление GitHub и сервера после отката

## 1. Обновить GitHub

Локально вы уже откатились на коммит `304f938`. Чтобы такая же история была на GitHub, выполните **force push** (перезапись истории на удалённой ветке):

```bash
git push origin main --force
```

**Важно:** если репозиторий общий, предупредите команду — у всех после этого нужно будет сделать `git fetch origin` и `git reset --hard origin/main`, иначе будут конфликты.

---

## 2. Обновить сервер

Подключитесь к серверу по SSH, перейдите в каталог проекта и обновите код с GitHub, затем перезапустите приложение.

### Вариант A: обычный pull (если на сервере никто не коммитил)

```bash
cd /path/to/exam-platform   # ваш путь к проекту на сервере
git fetch origin
git reset --hard origin/main
```

### Вариант B: если на сервере были локальные коммиты

Сначала сохраните их при необходимости:

```bash
git stash
# или
git branch backup-$(date +%Y%m%d)
```

Затем:

```bash
git fetch origin
git reset --hard origin/main
```

### После обновления кода

- Установить зависимости (если менялся `package.json`):
  ```bash
  npm install
  # в монорепо возможно:
  npm install --workspaces
  ```
- Применить миграции БД (если менялась схема Prisma):
  ```bash
  cd apps/api && npx prisma migrate deploy
  ```
- Перезапустить API и/или веб:
  ```bash
  pm2 restart all
  # или как у вас настроено:
  pm2 restart api
  pm2 restart web
  ```

Готово. GitHub и сервер будут в одном и том же откатанном состоянии.
