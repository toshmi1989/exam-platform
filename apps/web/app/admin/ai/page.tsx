'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import Button from '../../../components/Button';
import AdminGuard from '../components/AdminGuard';
import AdminNav from '../components/AdminNav';
import { readSettings, Language } from '../../../lib/uiSettings';

export default function AdminAIHubPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'AI',
        subtitle: 'Generate Зиёда explanations and oral answers.',
        tests: 'Tests',
        testsHint: 'Pre-generate explanations for test questions.',
        oral: 'Oral',
        oralHint: 'Pre-generate answers for oral questions.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'AI',
        subtitle: "Ziyoda tushuntirishlari va og'zaki javoblarni yaratish.",
        tests: 'Testlar',
        testsHint: "Test savollari uchun tushuntirishlarni yaratish.",
        oral: "Og'zaki",
        oralHint: "Og'zaki savollar uchun javoblarni yaratish.",
      };
    }
    return {
      title: 'AI',
      subtitle: 'Генерация объяснений Зиёды и устных ответов.',
      tests: 'Тесты',
      testsHint: 'Предгенерация объяснений для тестовых вопросов.',
      oral: 'Устные',
      oralHint: 'Предгенерация ответов для устных вопросов.',
    };
  }, [language]);

  return (
    <>
      <AnimatedPage>
        <main className="flex min-h-screen flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <div className="grid gap-4 sm:grid-cols-2">
              <Link href="/admin/ai/tests">
                <Card className="h-full cursor-pointer transition hover:border-[#2AABEE]/50 hover:shadow-md">
                  <div className="flex flex-col gap-2">
                    <span className="text-lg font-semibold text-slate-800">{copy.tests}</span>
                    <p className="text-sm text-slate-600">{copy.testsHint}</p>
                    <Button type="button" variant="secondary" size="md" className="mt-2 w-fit">
                      {copy.tests} →
                    </Button>
                  </div>
                </Card>
              </Link>
              <Link href="/admin/ai/oral">
                <Card className="h-full cursor-pointer transition hover:border-[#2AABEE]/50 hover:shadow-md">
                  <div className="flex flex-col gap-2">
                    <span className="text-lg font-semibold text-slate-800">{copy.oral}</span>
                    <p className="text-sm text-slate-600">{copy.oralHint}</p>
                    <Button type="button" variant="secondary" size="md" className="mt-2 w-fit">
                      {copy.oral} →
                    </Button>
                  </div>
                </Card>
              </Link>
            </div>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
