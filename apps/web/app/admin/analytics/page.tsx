'use client';

import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import AdminGuard from '../components/AdminGuard';
import AdminNav from '../components/AdminNav';
import { readSettings, Language } from '../../../lib/uiSettings';
import { getAdminAnalytics, type AdminAnalytics } from '../../../lib/api';

export default function AdminAnalyticsPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    setLoading(true);
    getAdminAnalytics()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Analytics',
        subtitle: 'Usage and conversion metrics.',
        attempts: 'Attempts by day',
        conversion: 'Subscription conversion',
        conversionHint: 'Active subscriptions / total users.',
        top: 'Top exams (tests)',
        topOral: 'Top exams (oral)',
        loading: 'Loading...',
        noData: 'No data yet.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Analitika',
        subtitle: 'Foydalanish va konversiya ko‘rsatkichlari.',
        attempts: 'Kunlik urinishlar',
        conversion: 'Obunaga konversiya',
        conversionHint: 'Faol obunalar / jami foydalanuvchilar.',
        top: 'Top imtihonlar (testlar)',
        topOral: "Top imtihonlar (og'zaki)",
        loading: 'Yuklanmoqda...',
        noData: 'Hali ma’lumot yo‘q.',
      };
    }
    return {
      title: 'Аналитика',
      subtitle: 'Метрики использования и конверсии.',
      attempts: 'Попытки по дням',
      conversion: 'Конверсия в подписку',
      conversionHint: 'Активные подписки / всего пользователей.',
        top: 'Топ экзамены (тесты)',
        topOral: 'Топ экзамены (устные)',
        loading: 'Загружаем...',
        noData: 'Пока нет данных.',
    };
  }, [language]);

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <div className="grid gap-4">
              <Card title={copy.attempts}>
                {loading ? (
                  <p className="text-sm text-slate-500">{copy.loading}</p>
                ) : data?.attemptsByDay.length ? (
                  <div className="space-y-1 overflow-hidden">
                    <div className="overflow-x-auto -mx-1 px-1 overscroll-x-contain">
                      <div
                        className="flex items-end gap-0.5 pb-0.5"
                        style={{ minWidth: `${Math.max(data.attemptsByDay.length * 14, 120)}px` }}
                      >
                        {data.attemptsByDay.map(({ date, count }) => {
                          const max = Math.max(
                            ...data.attemptsByDay.map((d) => d.count),
                            1
                          );
                          const h = max > 0 ? (count / max) * 80 : 0;
                          return (
                            <div
                              key={date}
                              className="flex shrink-0 flex-col items-center gap-0.5"
                              title={`${date}: ${count}`}
                            >
                              <span
                                className="w-2.5 min-w-[10px] rounded-t bg-[#2AABEE]"
                                style={{ height: `${h}px` }}
                              />
                              <span className="text-[10px] text-slate-500">
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {data.attemptsByDay[0]?.date} —{' '}
                      {data.attemptsByDay[data.attemptsByDay.length - 1]?.date}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{copy.noData}</p>
                )}
              </Card>
              <Card title={copy.conversion}>
                {loading ? (
                  <p className="text-sm text-slate-500">{copy.loading}</p>
                ) : data ? (
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold text-slate-900">
                      {data.conversion.subscribed} / {data.conversion.total}{' '}
                      {data.conversion.total > 0
                        ? `(${Math.round((data.conversion.subscribed / data.conversion.total) * 100)}%)`
                        : ''}
                    </p>
                    <p className="text-slate-500">{copy.conversionHint}</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{copy.noData}</p>
                )}
              </Card>
              <Card title={copy.top}>
                {loading ? (
                  <p className="text-sm text-slate-500">{copy.loading}</p>
                ) : data?.topExams.length ? (
                  <ul className="space-y-2">
                    {data.topExams.map((exam, i) => (
                      <li
                        key={exam.examId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                      >
                        <span className="truncate text-slate-700">
                          {i + 1}. {exam.title}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-900">
                          {exam.attemptCount}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">{copy.noData}</p>
                )}
              </Card>
              <Card title={copy.topOral}>
                {loading ? (
                  <p className="text-sm text-slate-500">{copy.loading}</p>
                ) : data?.topOralExams?.length ? (
                  <ul className="space-y-2">
                    {data.topOralExams.map((exam, i) => (
                      <li
                        key={exam.examId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                      >
                        <span className="truncate text-slate-700" title={exam.title}>
                          {i + 1}. {exam.title}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-900">
                          {exam.attemptCount}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">{copy.noData}</p>
                )}
              </Card>
            </div>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
