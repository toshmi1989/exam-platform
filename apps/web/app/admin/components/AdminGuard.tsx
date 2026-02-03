'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import { readTelegramUser, TelegramUserSnapshot } from '../../../lib/telegramUser';
import { readSettings, Language } from '../../../lib/uiSettings';

export default function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<TelegramUserSnapshot | null>(null);
  const [language, setLanguage] = useState<Language>(readSettings().language);

  useEffect(() => {
    setUser(readTelegramUser());
    const update = () => setUser(readTelegramUser());
    window.addEventListener('telegram-user-changed', update);
    return () => window.removeEventListener('telegram-user-changed', update);
  }, []);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  const copy =
    language === 'Английский'
      ? {
          title: 'Access limited',
          subtitle: 'This section is for administrators only.',
          action: 'Back to cabinet',
        }
      : language === 'Узбекский'
        ? {
            title: 'Kirish cheklangan',
            subtitle: 'Bu bo‘lim faqat administratorlar uchun.',
            action: 'Kabinetga qaytish',
          }
        : {
            title: 'Доступ ограничен',
            subtitle: 'Этот раздел только для администраторов.',
            action: 'Назад в кабинет',
          };

  const isAdmin = Boolean(user?.isAdmin || user?.role === 'admin');

  if (!isAdmin) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h2 className="text-lg font-semibold text-slate-900">{copy.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{copy.subtitle}</p>
        <div className="mt-4">
          <Button onClick={() => router.push('/cabinet')} size="lg">
            {copy.action}
          </Button>
        </div>
      </Card>
    );
  }

  return <>{children}</>;
}
