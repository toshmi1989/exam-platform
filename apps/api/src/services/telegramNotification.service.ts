/**
 * Telegram notification service for sending payment notifications to channel
 */

interface PaymentNotificationData {
  userId: string;
  telegramId: string;
  firstName: string | null;
  username: string | null;
  kind: 'one-time' | 'subscription';
  amountTiyin: number;
  mcUuid: string | null;
  examTitle?: string | null;
  subscriptionEndsAt?: Date | null;
}

const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const CHANNEL_ID = (process.env.TELEGRAM_NOTIFICATION_CHANNEL_ID ?? '').trim();

/**
 * Format amount from tiyin to sum
 */
function formatAmount(tiyin: number): string {
  return (tiyin / 100).toLocaleString('ru-UZ', { maximumFractionDigits: 0 });
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Escape for HTML (Telegram HTML parse_mode)
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Send payment notification to Telegram channel
 */
export async function sendPaymentNotification(data: PaymentNotificationData): Promise<void> {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    console.warn(
      '[telegram-notification] Skipping: BOT_TOKEN=%s CHANNEL_ID=%s',
      BOT_TOKEN ? 'set' : 'missing',
      CHANNEL_ID ? `${CHANNEL_ID.slice(0, 8)}...` : 'missing'
    );
    return;
  }

  console.log('[telegram-notification] Sending to channel:', CHANNEL_ID);

  if (!data.mcUuid) {
    console.warn('[telegram-notification] No mcUuid provided, receipt button will be omitted');
  }

  try {
    const userName = data.firstName ? escapeHtml(data.firstName) : 'Не указано';
    const userUsername = data.username ? `@${escapeHtml(data.username)}` : 'не указан';

    const paymentType = data.kind === 'one-time' ? 'Разовый доступ' : 'Подписка';
    const paymentDetails =
      data.kind === 'one-time'
        ? data.examTitle
          ? escapeHtml(data.examTitle)
          : 'Экзамен не указан'
        : 'Подписка на все экзамены';

    const amount = formatAmount(data.amountTiyin);
    const duration =
      data.kind === 'one-time'
        ? 'Разовый доступ'
        : data.subscriptionEndsAt
          ? `до ${formatDate(data.subscriptionEndsAt)}`
          : 'Срок не указан';

    const message = `💰 <b>Новая оплата</b>

👤 Пользователь: ${userName} (${userUsername})
🆔 ID: <code>${escapeHtml(data.telegramId)}</code>

💳 Тип: ${escapeHtml(paymentType)}
📝 ${paymentDetails}
💰 Сумма: ${escapeHtml(amount)} сум
📅 Срок: ${escapeHtml(duration)}`;

    const replyMarkup: {
      inline_keyboard: Array<Array<{ text: string; url: string }>>;
    } = {
      inline_keyboard: [],
    };

    if (data.mcUuid) {
      replyMarkup.inline_keyboard.push([
        {
          text: '🔗 Чек оплаты',
          url: `https://checkout.multicard.uz/check/${data.mcUuid}`,
        },
      ]);
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: CHANNEL_ID,
      text: message,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
      disable_web_page_preview: false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text();
    let result: { ok?: boolean; error_code?: number; description?: string } = {};
    try {
      result = JSON.parse(bodyText) as typeof result;
    } catch {
      // ignore
    }

    if (!response.ok) {
      console.error('[telegram-notification] Telegram API error:', response.status, bodyText);
      throw new Error(`Telegram API: ${response.status} ${result.description ?? bodyText}`);
    }

    if (!result.ok) {
      console.error('[telegram-notification] Telegram API result not ok:', result.error_code, result.description);
      throw new Error(`Telegram API error: ${result.error_code} ${result.description ?? ''}`);
    }

    console.log('[telegram-notification] Payment notification sent successfully');
  } catch (err) {
    console.error('[telegram-notification] Failed to send notification:', err);
  }
}
