'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import ErrorState from '../../../../components/ErrorState';
import PageHeader from '../../../../components/PageHeader';
import { createAttempt, startAttempt } from '../../../../lib/api';
import type { AttemptRef, ApiError } from '../../../../lib/types';
import { readSettings, Language } from '../../../../lib/uiSettings';

export default function ExamStartPage() {
  const params = useParams<{ examId: string }>();
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptRef | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<Language>(readSettings().language);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        loading: 'Preparing your attempt...',
        errorTitle: 'Unable to start',
        errorDefault: 'Access denied.',
        dailyLimitTitle: 'Daily limit used',
        dailyLimitHint: 'Your free attempts for today are used. Get a subscription to continue.',
        buySubscriptionCta: 'Get subscription',
        oneTimeCta: 'One-time access',
        title: 'Exam instructions',
        subtitle: 'Take a moment to get ready before the timer starts.',
        rule1: 'Read all questions carefully before answering.',
        rule2: 'Your timer starts when you click Start Exam.',
        rule3: 'Answers are autosaved when you type.',
        start: 'Start Exam',
      };
    }
    if (language === 'Узбекский') {
      return {
        loading: 'Urinish tayyorlanmoqda...',
        errorTitle: 'Boshlash mumkin emas',
        errorDefault: 'Kirish rad etildi.',
        dailyLimitTitle: 'Kunlik limit tugadi',
        dailyLimitHint: 'Bepul urinishlar bugun tugadi. Davom etish uchun obuna oling.',
        buySubscriptionCta: 'Obuna olish',
        oneTimeCta: 'Bir martalik kirish',
        title: 'Imtihon ko‘rsatmalari',
        subtitle: 'Tayyorlanib oling, taymer start bosilganda ishga tushadi.',
        rule1: 'Javob berishdan oldin savollarni diqqat bilan o‘qing.',
        rule2: 'Taymer "Imtihonni boshlash" bosilganda ishlaydi.',
        rule3: 'Javoblar yozishda avtomatik saqlanadi.',
        start: 'Imtihonni boshlash',
      };
    }
    return {
      loading: 'Подготавливаем попытку...',
      errorTitle: 'Не удалось начать',
      errorDefault: 'Доступ запрещён.',
      dailyLimitTitle: 'Дневной лимит исчерпан',
      dailyLimitHint: 'Бесплатные попытки на сегодня израсходованы. Для продолжения нужна подписка.',
      buySubscriptionCta: 'Купить подписку',
      oneTimeCta: 'Разовый доступ',
      title: 'Инструкции к экзамену',
      subtitle: 'Приготовьтесь, таймер стартует после нажатия.',
      rule1: 'Внимательно прочитайте вопросы перед ответом.',
      rule2: 'Таймер начнётся после нажатия «Начать экзамен».',
      rule3: 'Ответы сохраняются автоматически.',
      start: 'Начать экзамен',
    };
  }, [language]);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initAttempt() {
      try {
        const created = await createAttempt(params.examId, 'exam');
        if (cancelled) return;
        setAttempt(created);
      } catch (err) {
        if (cancelled) return;
        const apiError = err as ApiError;
        if (apiError?.reasonCode === 'ACCESS_DENIED') {
          setAccessDenied(true);
          return;
        }
        setError(apiError);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initAttempt();

    return () => {
      cancelled = true;
    };
  }, [params.examId, router]);

  async function handleStart() {
    if (!attempt) return;
    try {
      await startAttempt(attempt.attemptId);
      router.push(`/attempt/${attempt.attemptId}`);
    } catch (err) {
      setError(err as ApiError);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-600">
        {copy.loading}
      </p>
    );
  }

  if (accessDenied) {
    return (
      <main className="flex flex-col gap-6 px-4 pb-28 pt-[3.75rem]">
        <Card>
          <div className="flex flex-col gap-3">
            <p className="font-semibold text-amber-800">{copy.dailyLimitTitle}</p>
            <p className="text-sm text-slate-600">{copy.dailyLimitHint}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Button href="/cabinet/subscribe" size="lg">
                {copy.buySubscriptionCta}
              </Button>
              <Button
                href={`/cabinet/pay-one-time?examId=${encodeURIComponent(String(params.examId))}&mode=exam`}
                variant="secondary"
                size="lg"
              >
                {copy.oneTimeCta}
              </Button>
            </div>
          </div>
        </Card>
      </main>
    );
  }

  if (error) {
    return (
      <ErrorState
        title={copy.errorTitle}
        description={error.reasonCode ?? copy.errorDefault}
      />
    );
  }

  return (
    <main className="flex flex-col gap-8">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <Card>
        <ul className="list-disc space-y-2 pl-4 text-sm text-slate-700">
          <li>{copy.rule1}</li>
          <li>{copy.rule2}</li>
          <li>{copy.rule3}</li>
        </ul>
      </Card>
      <Button onClick={handleStart} size="lg">
        {copy.start}
      </Button>
    </main>
  );
}
