# Production Deployment Guide

## Production Architecture

The project uses a **release-based deployment** strategy. All services run from a
symlink (`/opt/exam/current`) that points to the latest release folder.

```
/opt/exam/
├── releases/
│   ├── 2026-02-19-0601/
│   ├── 2026-02-19-0627/
│   └── ...
├── current -> symlink → latest release
└── deploy.sh
```

Services (`pm2`) are started from `/opt/exam/current/`, **not** from
`/opt/exam/exam-platform/`.

---

## How to Deploy

**Single command — always use this:**

```bash
/opt/exam/deploy.sh
```

The script performs all steps automatically:

1. Creates a new `releases/YYYY-MM-DD-HHMM/` directory
2. Copies the project from the Git working directory
3. Runs `npm ci` for the backend
4. Runs `npx prisma generate`
5. Runs `npx prisma migrate deploy`
6. Runs `npm run build` for the backend
7. Runs `npm ci` for the frontend
8. Runs `next build` for the frontend
9. Switches the `current` symlink to the new release
10. Runs `pm2 reload` to restart services
11. Removes old releases (keeps last N)

> **Never** run `npm run build`, `pm2 start`, or `pm2 restart` manually in
> production. Always use `deploy.sh`.

---

## Workflow: Making Changes and Deploying

```
1. Edit code locally (Cursor / IDE)
2. Commit changes to Git
3. Push to main branch (GitHub)
4. On server: git pull origin main
5. On server: /opt/exam/deploy.sh
```

---

## Prisma Migration Workflow

### Development (local)

When you change `apps/api/prisma/schema.prisma`:

```bash
cd apps/api
npx prisma migrate dev --name descriptive_migration_name
```

This:
- Creates `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`
- Applies the migration to the local dev database
- Regenerates the Prisma client

After the migration is created locally:
```bash
git add apps/api/prisma/
git commit -m "add prisma migration: <name>"
git push origin main
```

Then deploy on the server using `deploy.sh` — it runs `prisma migrate deploy`
automatically.

### Production (server)

`deploy.sh` runs:
```bash
npx prisma migrate deploy
```

This applies only already-existing migrations. It **never** creates new ones.

### Rules — DO NOT

| Action | Why |
|--------|-----|
| Change `schema.prisma` without running `migrate dev` locally | Migration SQL file will be missing — deploy will fail |
| Run `prisma migrate dev` on the production server | Can corrupt the production database |
| Run `prisma db push` in production | Bypasses migration history, unsafe |
| Delete migration folders manually without analysis | Can break migration state |
| Deploy without committing migration files | Server will not have the SQL file |

---

## Checking Migrations Before Deploy

Run this on the server to verify all migration directories contain a `migration.sql` file:

```bash
for d in /opt/exam/current/apps/api/prisma/migrations/*/; do
  if [ ! -f "${d}migration.sql" ]; then
    echo "MISSING migration.sql in: $d"
  fi
done
```

---

## DO NOT Section

| Action | Correct Alternative |
|--------|---------------------|
| `npm run build` on server | Use `deploy.sh` |
| `pm2 start ecosystem.config.js` | Use `deploy.sh` |
| `pm2 restart api` | Use `deploy.sh` (or `pm2 reload` if hotfix only) |
| Manual `npx prisma migrate dev` on server | Only run `migrate deploy` via `deploy.sh` |
| Deploy code without migration file | Create migration locally first |
| Edit code directly on server | Edit locally, commit, push, then deploy |
