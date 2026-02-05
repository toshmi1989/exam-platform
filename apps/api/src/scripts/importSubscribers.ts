/**
 * Импорт подписчиков из CSV в таблицу User.
 *
 * Формат CSV: первая строка — заголовки, затем строки с данными.
 * Обязательная колонка: telegram_id (или telegram_id).
 * Опционально: first_name, username.
 *
 * Пример CSV:
 *   telegram_id,first_name,username
 *   123456789,Иван,ivan_user
 *   987654321,Мария,
 *
 * Использование:
 *   npx ts-node -r tsconfig-paths/register src/scripts/importSubscribers.ts path/to/subscribers.csv
 *   или: npm run import:subscribers -- path/to/subscribers.csv
 *
 * База данных не пересоздаётся — только добавление/обновление пользователей (upsert по telegram_id).
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../db/prisma';

function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (delimiter.includes(c)) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(content: string, delimiter: string = ','): { header: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('CSV должен содержать строку заголовков и хотя бы одну строку данных');
  }
  const header = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));
  return { header, rows };
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Укажите путь к CSV: npx ts-node src/scripts/importSubscribers.ts <path/to/file.csv>');
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), csvPath);
  if (!fs.existsSync(resolved)) {
    console.error('Файл не найден:', resolved);
    process.exit(1);
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  const delimiter = process.env.CSV_DELIMITER || ',';
  const { header, rows } = parseCsv(content, delimiter);

  const idxTelegramId = header.findIndex((h) => h === 'telegram_id' || h === 'telegramid');
  const idxFirstName = header.findIndex((h) => h === 'first_name' || h === 'firstname' || h === 'firstName');
  const idxUsername = header.findIndex((h) => h === 'username' || h === 'user_name');

  if (idxTelegramId === -1) {
    console.error('В CSV должна быть колонка telegram_id. Найденные колонки:', header.join(', '));
    process.exit(1);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const telegramId = String(row[idxTelegramId] ?? '').trim();
    if (!telegramId) {
      skipped++;
      continue;
    }

    const firstName = idxFirstName >= 0 ? String(row[idxFirstName] ?? '').trim() || null : null;
    const username = idxUsername >= 0 ? String(row[idxUsername] ?? '').trim().replace(/^@/, '') || null : null;

    const userId = `tg-${telegramId}`;
    const existing = await prisma.user.findUnique({ where: { telegramId } });

    await prisma.user.upsert({
      where: { telegramId },
      update: {
        firstName: firstName ?? undefined,
        username: username ?? undefined,
      },
      create: {
        id: userId,
        telegramId,
        firstName: firstName ?? undefined,
        username: username ?? undefined,
        role: 'USER',
      },
    });

    if (existing) updated++;
    else created++;
  }

  console.log('Готово. Создано:', created, 'обновлено:', updated, 'пропущено (пустой telegram_id):', skipped);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
