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
 * Escape special characters for MarkdownV2
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Send payment notification to Telegram channel
 */
export async function sendPaymentNotification(data: PaymentNotificationData): Promise<void> {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    console.warn('[telegram-notification] Bot token or channel ID not configured, skipping notification');
    return;
  }

  if (!data.mcUuid) {
    console.warn('[telegram-notification] No mcUuid provided, cannot generate receipt link');
  }

  try {
    // Format user info
    const userName = data.firstName
      ? escapeMarkdown(data.firstName)
      : 'Не указано';
    const userUsername = data.username
      ? `@${escapeMarkdown(data.username)}`
      : 'не указан';
    const telegramId = escapeMarkdown(data.telegramId);

    // Format payment type and details
    const paymentType = data.kind === 'one-time' ? 'Разовый доступ' : 'Подписка';
    const paymentDetails =
      data.kind === 'one-time'
        ? data.examTitle
          ? escapeMarkdown(data.examTitle)
          : 'Экзамен не указан'
        : 'Подписка на все экзамены';

    // Format amount
    const amount = formatAmount(data.amountTiyin);

    // Format duration
    const duration =
      data.kind === 'one-time'
        ? 'Разовый доступ'
        : data.subscriptionEndsAt
          ? `до ${formatDate(data.subscriptionEndsAt)}`
          : 'Срок не указан';

    // Build message
    const message = `💰 *Новая оплата*

👤 Пользователь: ${userName} \\(${userUsername}\\)
🆔 ID: ${telegramId}

💳 Тип: ${escapeMarkdown(paymentType)}
📝 ${paymentDetails}
💰 Сумма: ${escapeMarkdown(amount)} сум
📅 Срок: ${escapeMarkdown(duration)}`;

    // Build inline keyboard with receipt link
    const replyMarkup: {
      inline_keyboard: Array<Array<{ text: string; url: string }>>;
    } = {
      inline_keyboard: [],
    };

    if (data.mcUuid) {
      const receiptUrl = `https://checkout.multicard.uz/check/${data.mcUuid}`;
      replyMarkup.inline_keyboard.push([
        {
          text: '🔗 Чек оплаты',
          url: receiptUrl,
        },
      ]);
    }

    // Send message to Telegram
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHANNEL_ID,
        text: message,
        parse_mode: 'MarkdownV2',
        reply_markup: replyMarkup,
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as { ok: boolean; error_code?: number };
    if (!result.ok) {
      throw new Error(`Telegram API returned error: ${result.error_code}`);
    }

    console.log('[telegram-notification] Payment notification sent successfully');
  } catch (err) {
    // Log error but don't throw - payment processing should continue
    console.error('[telegram-notification] Failed to send notification:', err);
  }
}
