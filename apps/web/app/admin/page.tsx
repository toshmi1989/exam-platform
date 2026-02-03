'use client';

import AnimatedPage from '../../components/AnimatedPage';
import BottomNav from '../../components/BottomNav';
import Card from '../../components/Card';
import PageHeader from '../../components/PageHeader';
import AdminGuard from './components/AdminGuard';
import AdminNav from './components/AdminNav';
import { readSettings, Language } from '../../lib/uiSettings';
import { getAdminStats } from '../../lib/api';
import { useEffect, useMemo, useState } from 'react';

export default function AdminDashboardPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [stats, setStats] = useState<{
    totalUsers: number;
    activeSubscriptions: number;
    attemptsToday: number;
    conversion: number;
  } | null>(null);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Admin dashboard',
        subtitle: 'Overview of platform activity.',
        users: 'Users',
        subs: 'Active subscriptions',
        attempts: 'Attempts today',
        conversion: 'Conversion',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Admin panel',
        subtitle: 'Platforma faolligi bo‘yicha umumiy ko‘rinish.',
        users: 'Foydalanuvchilar',
        subs: 'Faol obunalar',
        attempts: 'Bugungi urinishlar',
        conversion: 'Konversiya',
      };
    }
    return {
      title: 'Админ‑панель',
      subtitle: 'Сводка по активности платформы.',
      users: 'Пользователи',
      subs: 'Активные подписки',
      attempts: 'Попытки за день',
      conversion: 'Конверсия',
    };
  }, [language]);

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <p className="text-sm text-slate-500">{copy.users}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats != null ? stats.totalUsers : '—'}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">{copy.subs}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats != null ? stats.activeSubscriptions : '—'}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">{copy.attempts}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats != null ? stats.attemptsToday : '—'}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">{copy.conversion}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats != null ? `${stats.conversion}%` : '—'}
                </p>
              </Card>
            </div>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
