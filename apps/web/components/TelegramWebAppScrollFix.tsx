'use client';

import { useEffect } from 'react';
import { isTelegramWebApp, disableVerticalSwipes } from '../lib/telegram';

/**
 * При открытии в Telegram отключает сворачивание Mini App при вертикальном свайпе,
 * чтобы прокрутка контента не уводила приложение в трей.
 */
export default function TelegramWebAppScrollFix() {
  useEffect(() => {
    if (typeof window === 'undefined' || !isTelegramWebApp()) return;
    const tg = (window as { Telegram?: { WebApp?: { ready?: () => void; disableVerticalSwipes?: () => void } } }).Telegram?.WebApp;
    tg?.ready?.();
    disableVerticalSwipes();
  }, []);
  return null;
}
