/** Имя бота для ссылки «Открыть в Telegram» (return после оплаты в браузере). */
export const TELEGRAM_BOT_USERNAME =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
    ? process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
    : 'ziyomedbot';

/** Ссылка на бота с /start: открывает Telegram и запускает Mini App (если бот настроен на открытие Web App по start). */
export function getOpenInTelegramAppUrl(): string {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}/start`;
}

export function isTelegramWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  const tg = (window as { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram;
  return Boolean(tg?.WebApp?.initData && tg.WebApp.initData.length > 0);
}

export function getTelegramInitData(): string | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram;
  return tg?.WebApp?.initData ?? null;
}

/**
 * Вызывает вибрацию устройства через Telegram WebApp HapticFeedback API или стандартный Vibration API
 * @param style - 'light' для лёгкого отклика на нажатие кнопок, 'medium'/'heavy' для более заметного (например ошибка)
 */
export function triggerHapticFeedback(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light'): void {
  if (typeof window === 'undefined') return;

  const tg = (window as {
    Telegram?: {
      WebApp?: {
        HapticFeedback?: {
          impactOccurred?: (s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
        };
      };
    };
  }).Telegram;

  if (tg?.WebApp?.HapticFeedback?.impactOccurred) {
    tg.WebApp.HapticFeedback.impactOccurred(style);
    if (style === 'medium') {
      setTimeout(() => tg.WebApp?.HapticFeedback?.impactOccurred?.('medium'), 100);
    }
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    if (style === 'light') {
      navigator.vibrate(15);
    } else {
      navigator.vibrate([80, 100, 80]);
    }
  }
}

/**
 * Открывает URL оплаты. В Telegram Mini App (особенно на Android) ссылка открывается во
 * внешнем браузере через openLink(), чтобы редирект на кастомные схемы (payme://, click://
 * и т.п.) обрабатывался системой, а не WebView (иначе возникает net::ERR_UNKNOWN_URL_SCHEME).
 * Вне Telegram — обычный переход по ссылке.
 */
export function openPaymentLink(url: string): void {
  if (typeof window === 'undefined') return;
  const tg = (window as { Telegram?: { WebApp?: { openLink?: (url: string) => void } } }).Telegram;
  if (tg?.WebApp?.openLink) {
    tg.WebApp.openLink(url);
  } else {
    window.location.href = url;
  }
}
