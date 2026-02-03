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
