/**
 * Создаёт тестового пользователя с активной подпиской для локальной разработки.
 * Использование:
 *   npm run seed:test-user   # по умолчанию 123456 или DEV_TELEGRAM_ID из .env
 *   Windows (PowerShell): $env:TELEGRAM_ID="YOUR_ID"; npm run seed:test-user
 *   Linux/macOS: TELEGRAM_ID=YOUR_ID npm run seed:test-user
 *
 * В .env добавьте DEV_TELEGRAM_ID=YOUR_ID — тогда в dev API будет считать запросы от этого ID.
 * Добавьте YOUR_ID в ADMIN_TELEGRAM_IDS, если нужен доступ в админку.
 */

const { prisma } = require('../db/prisma');
const { getAccessSettings } = require('../modules/settings/accessSettings.service');

const TELEGRAM_ID = process.env.TELEGRAM_ID ?? process.env.DEV_TELEGRAM_ID ?? '123456';

async function main() {
  const userId = `tg-${TELEGRAM_ID}`;

  const user = await prisma.user.upsert({
    where: { telegramId: TELEGRAM_ID },
    update: {},
    create: {
      id: userId,
      telegramId: TELEGRAM_ID,
      firstName: 'Test',
      username: 'testuser',
      role: 'USER',
    },
  });

  const settings = await getAccessSettings();
  const durationDays = Math.max(1, Number(settings.subscriptionDurationDays ?? 30));
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + durationDays);

  await prisma.userSubscription.updateMany({
    where: { userId: user.id, status: 'ACTIVE' },
    data: { status: 'CANCELED' },
  });

  await prisma.userSubscription.create({
    data: {
      userId: user.id,
      startsAt: now,
      endsAt,
      status: 'ACTIVE',
    },
  });

  console.log(`OK: User ${TELEGRAM_ID} (id: ${user.id}) has active subscription until ${endsAt.toISOString()}`);
  console.log('In apps/api/.env set DEV_TELEGRAM_ID=' + TELEGRAM_ID + ' and restart the API to test as this user.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
