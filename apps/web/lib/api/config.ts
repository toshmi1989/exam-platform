export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/** Публичный URL приложения (без слэша в конце). Нужен для загрузки статики (иконки оплаты) в Telegram Mini App. */
export const APP_BASE_URL =
  (typeof process.env.NEXT_PUBLIC_APP_URL === 'string' && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
  '';
