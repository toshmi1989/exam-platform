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
 * @param style - стиль вибрации: 'light', 'medium', 'heavy', 'rigid', 'soft' для Telegram, или массив для стандартного API
 */
export function triggerHapticFeedback(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium'): void {
  if (typeof window === 'undefined') return;
  
  const tg = (window as {
    Telegram?: {
      WebApp?: {
        HapticFeedback?: {
          impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
        };
      };
    };
  }).Telegram;

  // Используем Telegram WebApp HapticFeedback API если доступен
  if (tg?.WebApp?.HapticFeedback?.impactOccurred) {
    // Двойная вибрация средней силы с небольшой паузой
    tg.WebApp.HapticFeedback.impactOccurred('medium');
    setTimeout(() => {
      tg.WebApp?.HapticFeedback?.impactOccurred?.('medium');
    }, 100);
    return;
  }

  // Fallback на стандартный Vibration API - двойная вибрация средней силы
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    // Паттерн: вибрация 80ms, пауза 100ms, вибрация 80ms
    navigator.vibrate([80, 100, 80]);
  }
}
