'use client';

import AnimatedPage from '../../components/AnimatedPage';
import BottomNav from '../../components/BottomNav';
import Card from '../../components/Card';
import PageHeader from '../../components/PageHeader';
import AdminGuard from './components/AdminGuard';
import AdminNav from './components/AdminNav';
import { readSettings, Language } from '../../lib/uiSettings';
import { getAdminStats, type AdminStats } from '../../lib/api';
import { useEffect, useMemo, useState } from 'react';

export default function AdminDashboardPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [stats, setStats] = useState<AdminStats | null>(null);

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
        onlineToday: 'Online today',
        subs: 'Active subscriptions',
        conversion: 'Conversion',
        subsToday: 'Subscriptions today',
        subsThisMonth: 'Subscriptions this month',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Admin panel',
        subtitle: "Platforma faolligi bo'yicha umumiy ko'rinish.",
        users: 'Foydalanuvchilar',
        onlineToday: 'Bugun onlayn bo‘lganlar',
        subs: 'Faol obunalar',
        conversion: 'Konversiya',
        subsToday: "Bugun obuna bo'lganlar",
        subsThisMonth: "Shu oyda obuna bo'lganlar",
      };
    }
    return {
      title: 'Админ‑панель',
      subtitle: 'Сводка по активности платформы.',
      users: 'Пользователи',
      onlineToday: 'Сегодня были онлайн',
      subs: 'Активные подписки',
      conversion: 'Конверсия',
      subsToday: 'Купили подписку сегодня',
      subsThisMonth: 'Купили подписку за этот месяц',
    };
  }, [language]);

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <p className="text-sm text-slate-500">{copy.users}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats != null ? stats.totalUsers : '—'}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">{copy.onlineToday}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats != null ? stats.onlineTodayUsers : '—'}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">{copy.subs}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats != null ? stats.activeSubscriptions : '—'}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">{copy.subsToday}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats != null ? stats.subscriptionsToday : '—'}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">{copy.conversion}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats != null ? `${stats.conversion}%` : '—'}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">{copy.subsThisMonth}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats != null ? stats.subscriptionsThisMonth : '—'}
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
