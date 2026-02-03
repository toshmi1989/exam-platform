'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import { getTelegramInitData, isTelegramWebApp } from '../../../lib/telegram';
import { storeTelegramUser } from '../../../lib/telegramUser';
import { readSettings, Language } from '../../../lib/uiSettings';

type AuthStatus = 'idle' | 'loading' | 'error';

export default function TelegramAuthPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [errorMessage, setErrorMessage] = useState(
    'We could not verify your Telegram session. Please try again.'
  );

  const isTelegram = useMemo(() => isTelegramWebApp(), []);
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
      errorDefault: 'Не удалось подтвердить Telegram-сессию. Попробуйте снова.',
      errorInit: 'Не удалось прочитать Telegram-сессию. Откройте приложение заново.',
      errorVerify: 'Проверка Telegram не удалась. Попробуйте снова.',
      errorNetwork: 'Проблема с сетью. Проверьте интернет и повторите.',
    };
  }, [language]);

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

      <Card>
        {isTelegram ? (
          <p className="text-sm text-slate-700">
            {authStatus === 'loading' && copy.connecting}
            {authStatus === 'error' && errorMessage}
            {authStatus === 'idle' && copy.preparing}
          </p>
        ) : (
          <p className="text-sm text-slate-700">
            {copy.onlyTelegram}
          </p>
        )}
      </Card>

      {isTelegram ? (
        authStatus === 'error' && (
          <Button onClick={startTelegramAuth} size="lg">
            {copy.retry}
          </Button>
        )
      ) : (
        <Button
          size="lg"
          onClick={() => {
            window.location.href = 'https://t.me/tibtoifabot';
          }}
        >
          {copy.openInTelegram}
        </Button>
      )}
    </main>
  );
}
