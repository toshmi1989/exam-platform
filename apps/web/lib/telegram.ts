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
    tg.WebApp.HapticFeedback.impactOccurred(style);
    return;
  }

  // Fallback на стандартный Vibration API
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    const patterns: Record<string, number[]> = {
      light: [50],
      medium: [100],
      heavy: [200],
      rigid: [100, 50, 100],
      soft: [50, 30, 50],
    };
    navigator.vibrate(patterns[style] || patterns.medium);
  }
}
