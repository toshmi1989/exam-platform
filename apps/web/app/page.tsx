'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AnimatedPage from '../components/AnimatedPage';
import Button from '../components/Button';
import Card from '../components/Card';
import { getTelegramInitData, isTelegramWebApp } from '../lib/telegram';
import { readTelegramUser, storeTelegramUser } from '../lib/telegramUser';
import { readSettings, Language } from '../lib/uiSettings';

const TELEGRAM_BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'tibtoifabot';

type AuthStatus = 'idle' | 'loading' | 'error' | 'blocked';

export default function EntryPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const copyRef = useRef<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState(
    'We could not verify your Telegram session. Please try again.'
  );

  const isTelegram = useMemo(() => (typeof window !== 'undefined' && isTelegramWebApp()), []);
  const widgetContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);
  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        tagline: 'One question. Full focus. No stress.',
        connecting: 'Connecting to Telegram...',
        preparing: 'Preparing your Telegram session...',
        retry: 'Retry',
        continueTelegram: 'Continue with Telegram',
        guest: 'Try once without login',
        permission: 'We don’t post anything without your permission.',
        errorDefault: 'We could not verify your Telegram session. Please try again.',
        errorInit: 'We could not read your Telegram session. Please reopen the app.',
        errorVerify: 'Telegram verification failed. Please try again.',
        errorNetwork: 'Network issue. Please check your connection and retry.',
      };
    }
    if (language === 'Узбекский') {
      return {
        tagline: 'Bitta savol. To‘liq diqqat. Stresssiz.',
        connecting: 'Telegramga ulanmoqda...',
        preparing: 'Telegram sessiyasi tayyorlanmoqda...',
        retry: 'Qayta urinish',
        continueTelegram: 'Telegram orqali davom etish',
        guest: 'Bir marta kirishsiz sinab ko‘rish',
        permission: 'Ruxsatsiz hech narsa joylamaymiz.',
        errorDefault: 'Telegram sessiyasi tasdiqlanmadi. Qayta urinib ko‘ring.',
        errorInit: 'Telegram sessiyasi o‘qilmadi. Ilovani qayta oching.',
        errorVerify: 'Telegram tasdiqlash muvaffaqiyatsiz. Qayta urinib ko‘ring.',
        errorNetwork: 'Tarmoq xatosi. Internetni tekshirib qayta urinib ko‘ring.',
      };
    }
    return {
      tagline: 'Один вопрос. Полный фокус. Без стресса.',
      connecting: 'Подключаемся к Telegram...',
      preparing: 'Готовим Telegram-сессию...',
      retry: 'Повторить',
      continueTelegram: 'Продолжить с Telegram',
      guest: 'Попробовать без входа',
      permission: 'Мы ничего не публикуем без вашего разрешения.',
      errorDefault: 'Не удалось подтвердить Telegram-сессию. Попробуйте снова.',
      errorInit: 'Не удалось прочитать Telegram-сессию. Откройте приложение заново.',
      errorVerify: 'Проверка Telegram не удалась. Попробуйте снова.',
      errorNetwork: 'Проблема с сетью. Проверьте интернет и повторите.',
    };
  }, [language]);

  copyRef.current = copy;

  useEffect(() => {
    setErrorMessage(copy.errorDefault);
  }, [copy]);

  useEffect(() => {
    if (isTelegram) return;

    (window as unknown as { onTelegramAuth?: (user: Record<string, unknown>) => void }).onTelegramAuth =
      async (user: Record<string, unknown>) => {
        setAuthStatus('loading');
        try {
          const res = await fetch('/api/auth/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ widget: user }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.ok) {
            setErrorMessage(copyRef.current?.errorVerify ?? 'Verification failed.');
            setAuthStatus('error');
            return;
          }
          storeTelegramUser({
            firstName: data?.firstName,
            username: data?.username,
            telegramId: data?.telegramId,
            role: data?.role,
            isAdmin: data?.isAdmin,
          });
          window.location.href = '/cabinet';
        } catch {
          setErrorMessage(copyRef.current?.errorNetwork ?? 'Network error.');
          setAuthStatus('error');
        }
      };

    return () => {
      (window as unknown as { onTelegramAuth?: (user: Record<string, unknown>) => void }).onTelegramAuth = undefined;
    };
  }, [isTelegram]);

  // Виджет авторизации Telegram: вставка скрипта в DOM (Next.js Script часто не рендерит кнопку)
  useEffect(() => {
    if (!mounted || isTelegram || !widgetContainerRef.current) return;
    const container = widgetContainerRef.current;
    if (container.querySelector('script[data-telegram-login]')) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', TELEGRAM_BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth');
    container.appendChild(script);
    return () => {
      container.querySelector('script[data-telegram-login]')?.remove();
    };
  }, [mounted, isTelegram]);

  useEffect(() => {
    if (!isTelegram) return;

    const tg = (window as { Telegram?: { WebApp?: { ready?: () => void; expand?: () => void } } })
      .Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();

    void startTelegramAuth();
  }, [isTelegram]);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  async function startTelegramAuth() {
    setAuthStatus('loading');

    const initData = getTelegramInitData();
    if (!initData) {
      setErrorMessage(copy.errorInit);
      setAuthStatus('error');
      return;
    }

    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });

      if (res.status === 503) {
        setAuthStatus('blocked');
        return;
      }

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErrorMessage(copy.errorVerify);
        setAuthStatus('error');
        return;
      }

      const tgUser = (window as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number; first_name?: string; username?: string; photo_url?: string } } } } })
        .Telegram?.WebApp?.initDataUnsafe?.user;

      storeTelegramUser({
        firstName: data?.firstName ?? tgUser?.first_name,
        username: data?.username ?? tgUser?.username,
        telegramId: data?.telegramId ?? (tgUser?.id ? String(tgUser.id) : undefined),
        photoUrl: tgUser?.photo_url,
        role: data?.role,
        isAdmin: data?.isAdmin,
      });

      router.replace('/cabinet');
    } catch {
      setErrorMessage(copy.errorNetwork);
      setAuthStatus('error');
    }
  }

  async function handleGuest() {
    const existing = readTelegramUser();
    if (!existing?.telegramId) {
      const guestId = `guest-${Date.now()}`;
      storeTelegramUser({
        telegramId: guestId,
        firstName: 'Guest',
        role: 'authorized',
      });
    }
    router.push('/exam/select?access=one-time&guest=1');
  }

  return (
    <AnimatedPage>
      {authStatus === 'blocked' ? null : (
        <main className="flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-md p-6">
            <h1 className="text-2xl font-semibold">CalmExam</h1>

          <p className="mt-2 text-sm text-slate-600">
            {copy.tagline}
          </p>

          {!mounted ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {copy.preparing}
              </div>
            </div>
          ) : isTelegram ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {authStatus === 'loading' && copy.connecting}
                {authStatus === 'error' && errorMessage}
                {authStatus === 'idle' && copy.preparing}
              </div>

              {authStatus === 'error' && (
                <Button size="lg" className="w-full" onClick={startTelegramAuth}>
                  {copy.retry}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-col gap-3">
                <div
                  ref={widgetContainerRef}
                  id="telegram-login-widget"
                  className="flex min-h-[44px] justify-center"
                  aria-label="Telegram Login Widget"
                />
                <a
                  href="/auth/telegram"
                  className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#2AABEE] bg-[#2AABEE] px-4 py-3 text-base font-medium text-white no-underline transition hover:opacity-90"
                >
                  {copy.continueTelegram}
                </a>
                {authStatus === 'loading' && (
                  <p className="text-center text-sm text-slate-600">{copy.connecting}</p>
                )}
                {authStatus === 'error' && (
                  <p className="text-center text-sm text-red-600">{errorMessage}</p>
                )}
                {authStatus === 'error' && (
                  <Button size="lg" className="w-full" onClick={() => setAuthStatus('idle')}>
                    {copy.retry}
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  onClick={handleGuest}
                >
                  {copy.guest}
                </Button>
              </div>

              <p className="mt-4 text-xs text-slate-500">
                {copy.permission}
              </p>
            </>
          )}
          </Card>
        </main>
      )}
    </AnimatedPage>
  );
}
