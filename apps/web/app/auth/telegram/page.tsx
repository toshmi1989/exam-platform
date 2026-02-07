'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import { getTelegramInitData, isTelegramWebApp } from '../../../lib/telegram';
import { storeTelegramUser } from '../../../lib/telegramUser';
import { readSettings, Language } from '../../../lib/uiSettings';

const TELEGRAM_BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'tibtoifabot';

type AuthStatus = 'idle' | 'loading' | 'error';

export default function TelegramAuthPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [errorMessage, setErrorMessage] = useState(
    'We could not verify your Telegram session. Please try again.'
  );

  const isTelegram = useMemo(() => isTelegramWebApp(), []);
  const routerRef = useRef(router);
  routerRef.current = router;

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Continue with Telegram',
        subtitle: 'A quick step to access your exams.',
        connecting: 'Connecting to Telegram...',
        preparing: 'Preparing your Telegram session...',
        openInTelegram: 'Open in Telegram',
        retry: 'Retry',
        onlyTelegram: 'Please open this page inside Telegram to continue.',
        browserLoginHint: 'Log in with Telegram in your browser, or open the app in Telegram.',
        errorDefault: 'We could not verify your Telegram session. Please try again.',
        errorInit: 'We could not read your Telegram session. Please reopen the app.',
        errorVerify: 'Telegram verification failed. Please try again.',
        errorNetwork: 'Network issue. Please check your connection and retry.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Telegram orqali davom etish',
        subtitle: 'Imtihonlarga kirish uchun tezkor qadam.',
        connecting: 'Telegramga ulanmoqda...',
        preparing: 'Telegram sessiyasi tayyorlanmoqda...',
        openInTelegram: 'Telegramda ochish',
        retry: 'Qayta urinish',
        onlyTelegram: 'Davom etish uchun ilovani Telegramda oching.',
        browserLoginHint: 'Brauzerda Telegram orqali kiring yoki ilovani Telegramda oching.',
        errorDefault: 'Telegram sessiyasi tasdiqlanmadi. Qayta urinib ko‘ring.',
        errorInit: 'Telegram sessiyasi o‘qilmadi. Ilovani qayta oching.',
        errorVerify: 'Telegram tasdiqlash muvaffaqiyatsiz. Qayta urinib ko‘ring.',
        errorNetwork: 'Tarmoq xatosi. Internetni tekshirib qayta urinib ko‘ring.',
      };
    }
    return {
      title: 'Продолжить с Telegram',
      subtitle: 'Быстрый шаг для доступа к экзаменам.',
      connecting: 'Подключаемся к Telegram...',
      preparing: 'Готовим Telegram-сессию...',
      openInTelegram: 'Открыть в Telegram',
      retry: 'Повторить',
      onlyTelegram: 'Откройте эту страницу в Telegram для продолжения.',
      browserLoginHint: 'Войдите через Telegram в браузере или откройте приложение в Telegram.',
      errorDefault: 'Не удалось подтвердить Telegram-сессию. Попробуйте снова.',
      errorInit: 'Не удалось прочитать Telegram-сессию. Откройте приложение заново.',
      errorVerify: 'Проверка Telegram не удалась. Попробуйте снова.',
      errorNetwork: 'Проблема с сетью. Проверьте интернет и повторите.',
    };
  }, [language]);

  const copyRef = useRef(copy);
  copyRef.current = copy;

  useEffect(() => {
    setErrorMessage(copy.errorDefault);
  }, [copy]);

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

  useEffect(() => {
    if (isTelegram) return;

    const doRedirect = (url: string) => {
      if (typeof window === 'undefined') return;
      if (window.opener) {
        window.opener.location.href = url;
        window.close();
      } else if (window.outerWidth < 600 || window.outerHeight < 500) {
        const w = window.open(url, '_blank');
        if (w) window.close();
        else window.location.href = url;
      } else {
        window.location.href = url;
      }
    };

    const handleWidgetAuth = async (user: Record<string, unknown>) => {
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
        const target = '/cabinet';
        const url = (typeof window !== 'undefined' && window.location.origin) ? `${window.location.origin}${target}` : target;
        doRedirect(url);
      } catch {
        setErrorMessage(copyRef.current?.errorNetwork ?? 'Network error.');
        setAuthStatus('error');
      }
    };

    const win = window as unknown as { onTelegramAuth?: (u: Record<string, unknown>) => void; __telegramAuthQueue?: Record<string, unknown>[] };
    const queue = win.__telegramAuthQueue;
    if (queue?.length) {
      win.__telegramAuthQueue = [];
      queue.forEach((u) => void handleWidgetAuth(u));
    }
    win.onTelegramAuth = handleWidgetAuth;

    return () => {
      win.onTelegramAuth = undefined;
    };
  }, [isTelegram]);

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

  return (
    <main className="flex flex-col gap-6">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      {isTelegram && (
        <Card>
          <p className="text-sm text-slate-700">
            {authStatus === 'loading' && copy.connecting}
            {authStatus === 'error' && errorMessage}
            {authStatus === 'idle' && copy.preparing}
          </p>
        </Card>
      )}

      {isTelegram ? (
        authStatus === 'error' && (
          <Button onClick={startTelegramAuth} size="lg">
            {copy.retry}
          </Button>
        )
      ) : (
        <>
          <Card>
            <p className="text-sm text-slate-700">{copy.browserLoginHint}</p>
          </Card>
          <div id="telegram-widget-container" className="flex justify-center">
            <Script
              src="https://telegram.org/js/telegram-widget.js?22"
              data-telegram-login={TELEGRAM_BOT_USERNAME}
              data-size="large"
              data-onauth="onTelegramAuth"
              strategy="lazyOnload"
            />
          </div>
          {authStatus === 'loading' && (
            <p className="text-sm text-slate-600">{copy.connecting}</p>
          )}
          {authStatus === 'error' && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}
          <Button
            size="lg"
            onClick={() => {
              window.location.href = `https://t.me/${TELEGRAM_BOT_USERNAME}`;
            }}
          >
            {copy.openInTelegram}
          </Button>
        </>
      )}
    </main>
  );
}
