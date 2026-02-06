'use client';

import { Suspense } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AnimatedPage from '../../../components/AnimatedPage';
import BackButton from '../../../components/BackButton';
import BottomNav from '../../../components/BottomNav';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import { readSettings, Language } from '../../../lib/uiSettings';
import { apiFetch } from '../../../lib/api/client';
import { createAttempt, startAttempt, getProfile } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type ProfessionKey = 'doctors' | 'nurses';
type ExamTypeKey = 'test' | 'oral';
type ExamModeKey = 'exam' | 'practice';
type ExamLanguageKey = 'uz' | 'ru';

interface DirectionOption {
  id: string;
  label: string;
  examId: string;
}

const professionLabelsByLang: Record<Language, Record<ProfessionKey, string>> = {
  Русский: { doctors: 'Врачи', nurses: 'Медсестры' },
  Английский: { doctors: 'Doctors', nurses: 'Nurses' },
  Узбекский: { doctors: 'Shifokorlar', nurses: 'Hamshiralar' },
};

function ExamSelectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessMode = searchParams.get('access') === 'one-time' ? 'one-time' : 'default';
  const [profession, setProfession] = useState<ProfessionKey | null>(null);
  const [examType, setExamType] = useState<ExamTypeKey | null>(null);
  const [mode, setMode] = useState<ExamModeKey | null>(null);
  const [examLanguage, setExamLanguage] = useState<ExamLanguageKey | null>(null);
  const [direction, setDirection] = useState<DirectionOption | null>(null);
  const [directions, setDirections] = useState<DirectionOption[]>([]);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [directionsError, setDirectionsError] = useState(false);
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [startError, setStartError] = useState<string | null>(null);
  const [oneTimePrice, setOneTimePrice] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const professionLabels = useMemo(
    () => professionLabelsByLang[language],
    [language]
  );

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    getProfile()
      .then((p) => setOneTimePrice(p.oneTimePrice ?? null))
      .catch(() => setOneTimePrice(null));
  }, []);

  useEffect(() => {
    if (profession && examType && examLanguage) {
      void loadDirections();
    }
  }, [profession, examType, examLanguage]);

  async function loadDirections() {
    if (!profession || !examType || !examLanguage) return;
    setDirectionsLoading(true);
    setDirectionsError(false);
    setDirection(null);
    const professionParam = profession === 'doctors' ? 'DOCTOR' : 'NURSE';
    const languageParam = examLanguage === 'uz' ? 'UZ' : 'RU';
    const typeParam = examType === 'test' ? 'TEST' : 'ORAL';
    try {
      const { response, data } = await apiFetch(
        `/exams/directions?profession=${professionParam}&language=${languageParam}&type=${typeParam}`
      );
      if (!response.ok) {
        setDirectionsError(true);
        setDirections([]);
        return;
      }
      const payload = data as { directions?: { id: string; label: string }[] } | null;
      setDirections(
        (payload?.directions ?? []).map((entry) => ({
          id: entry.id,
          label: entry.label,
          examId: entry.id,
        }))
      );
    } catch {
      setDirectionsError(true);
      setDirections([]);
    } finally {
      setDirectionsLoading(false);
    }
  }

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Select exam',
        subtitle: 'Choose your options and start.',
        professionTitle: 'Profession',
        examTypeTitle: 'Exam type',
        test: 'Test',
        oral: 'Oral',
        modeTitle: 'Mode',
        modeExam: 'Submit exam',
        modePractice: 'Practice',
        languageTitle: 'Exam language',
        languageUz: 'Uzbek',
        languageRu: 'Russian',
        directionLabel: 'Direction',
        directionsLoading: 'Loading directions...',
        directionsEmpty: 'No directions found.',
        start: 'Start test',
        calmHint: 'Calm, focused practice for this direction.',
        oralStub: 'Oral exams will be available soon.',
        paymentRequired: 'One-time access is required before starting.',
        accessDenied: 'Access denied. Please purchase access.',
        accessDeniedTitle: 'Access denied',
        accessDeniedHint: 'To take this test you need a subscription or one-time access.',
        subscribeCta: 'Get subscription',
        oneTimeTitle: 'One-time access',
        oneTimeHint: 'One-time access to this test costs',
        payCta: 'Pay and start test',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Imtihon tanlash',
        subtitle: 'Variantlarni tanlang va boshlang.',
        professionTitle: 'Kasb',
        examTypeTitle: 'Imtihon turi',
        test: 'Test',
        oral: 'Og‘zaki',
        modeTitle: 'Rejim',
        modeExam: 'Imtihonni topshirish',
        modePractice: 'Tayyorgarlik',
        languageTitle: 'Imtihon tili',
        languageUz: 'O‘zbek',
        languageRu: 'Rus',
        directionLabel: 'Yo‘nalish',
        directionsLoading: 'Yo‘nalishlar yuklanmoqda...',
        directionsEmpty: 'Yo‘nalishlar hozircha yo‘q.',
        start: 'Testni boshlash',
        calmHint: 'Ushbu yo‘nalish uchun sokin mashg‘ulot.',
        oralStub: 'Og‘zaki imtihonlar tez orada qo‘shiladi.',
        paymentRequired: 'Boshlashdan oldin bir martalik kirish talab qilinadi.',
        accessDenied: 'Ruxsat yo‘q. Avval kirish sotib oling.',
        accessDeniedTitle: 'Ruxsat yo‘q',
        accessDeniedHint: 'Bu testni topshirish uchun obuna yoki bir martalik kirish kerak.',
        subscribeCta: 'Obuna olish',
        oneTimeTitle: 'Bir martalik kirish',
        oneTimeHint: 'Bu test uchun bir martalik kirish narxi',
        payCta: 'To‘lash va testni boshlash',
      };
    }
    return {
      title: 'Выбор экзамена',
      subtitle: 'Выберите параметры и начните.',
      professionTitle: 'Профессия',
      examTypeTitle: 'Тип экзамена',
      test: 'Тест',
      oral: 'Устный',
      modeTitle: 'Режим',
      modeExam: 'Сдать тест',
      modePractice: 'Готовиться к тесту',
      languageTitle: 'Язык экзамена',
      languageUz: 'Узбекский',
      languageRu: 'Русский',
      directionLabel: 'Направление',
      directionsLoading: 'Загружаем направления...',
      directionsEmpty: 'Направления пока не найдены.',
      start: 'Начать тест',
      calmHint: 'Спокойная практика для этого направления.',
      oralStub: 'Устные экзамены будут доступны позже.',
      paymentRequired: 'Перед стартом нужен разовый доступ.',
      accessDenied: 'Доступ запрещен. Сначала оплатите доступ.',
      accessDeniedTitle: 'Доступ ограничен',
      accessDeniedHint: 'Чтобы пройти этот тест, нужна подписка или разовый доступ.',
      subscribeCta: 'Оформить подписку',
      oneTimeTitle: 'Разовый доступ',
      oneTimeHint: 'Разовый доступ к этому тесту стоит',
      payCta: 'Оплатить и начать тест',
    };
  }, [language]);

  function startExam() {
    if (!direction || !mode || isStarting) return;
    setIsStarting(true);
    setStartError(null);
    void (async () => {
      try {
        const attempt = await createAttempt(direction.examId, mode);
        await startAttempt(attempt.attemptId);
        router.push(`/attempt/${attempt.attemptId}`);
      } catch (err) {
        const reason = (err as { reasonCode?: string })?.reasonCode;
        if (accessMode === 'one-time') {
          setStartError(copy.paymentRequired);
          return;
        }
        if (reason === 'ACCESS_DENIED') {
          setStartError(copy.accessDenied);
          return;
        }
        setStartError(copy.accessDenied);
      } finally {
        setIsStarting(false);
      }
    })();
  }

  const canStart = profession && examType && examType !== 'oral' && mode && examLanguage && direction && !directionsLoading;

  return (
    <>
      <AnimatedPage>
        <main className="flex min-h-[70vh] flex-col gap-6 pb-28 pt-[3.75rem]">
          <BackButton placement="bottom" />
          <PageHeader title={copy.title} subtitle={copy.subtitle} />

          <div className="flex flex-col gap-4">
            {/* Профессия */}
            <Card title={copy.professionTitle}>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(professionLabels).map(([key, label]) => (
                  <Button
                    key={key}
                    size="lg"
                    variant={profession === key ? 'primary' : 'secondary'}
                    onClick={() => {
                      setProfession(key as ProfessionKey);
                      setExamType(null);
                      setMode(null);
                      setExamLanguage(null);
                      setDirection(null);
                      setStartError(null);
                    }}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className="h-8 w-8 rounded-lg bg-white/20 p-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={key === 'doctors' ? '/icons/doctor.svg' : '/icons/nurse.svg'}
                          alt={key === 'doctors' ? 'Doctor icon' : 'Nurse icon'}
                          className="h-full w-full object-contain"
                        />
                      </span>
                      <span>{label}</span>
                    </div>
                  </Button>
                ))}
              </div>
            </Card>

            {/* Тип экзамена */}
            {profession && (
              <Card title={copy.examTypeTitle}>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    variant={examType === 'test' ? 'primary' : 'secondary'}
                    onClick={() => {
                      setExamType('test');
                      setMode(null);
                      setExamLanguage(null);
                      setDirection(null);
                      setStartError(null);
                    }}
                  >
                    {copy.test}
                  </Button>
                  <Button
                    size="lg"
                    variant={examType === 'oral' ? 'primary' : 'secondary'}
                    onClick={() => {
                      setExamType('oral');
                      setMode(null);
                      setExamLanguage(null);
                      setDirection(null);
                      setStartError(null);
                    }}
                  >
                    {copy.oral}
                  </Button>
                </div>
              </Card>
            )}

            {/* Режим */}
            {profession && examType === 'test' && (
              <Card title={copy.modeTitle}>
                <div className="grid gap-3">
                  <Button
                    size="lg"
                    variant={mode === 'exam' ? 'primary' : 'secondary'}
                    onClick={() => {
                      setMode('exam');
                      setExamLanguage(null);
                      setDirection(null);
                      setStartError(null);
                    }}
                  >
                    {copy.modeExam}
                  </Button>
                  <Button
                    size="lg"
                    variant={mode === 'practice' ? 'primary' : 'secondary'}
                    onClick={() => {
                      setMode('practice');
                      setExamLanguage(null);
                      setDirection(null);
                      setStartError(null);
                    }}
                  >
                    {copy.modePractice}
                  </Button>
                </div>
              </Card>
            )}

            {/* Язык */}
            {profession && examType === 'test' && mode && (
              <Card title={copy.languageTitle}>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    variant={examLanguage === 'uz' ? 'primary' : 'secondary'}
                    onClick={() => {
                      setExamLanguage('uz');
                      setDirection(null);
                      setStartError(null);
                    }}
                  >
                    {copy.languageUz}
                  </Button>
                  <Button
                    size="lg"
                    variant={examLanguage === 'ru' ? 'primary' : 'secondary'}
                    onClick={() => {
                      setExamLanguage('ru');
                      setDirection(null);
                      setStartError(null);
                    }}
                  >
                    {copy.languageRu}
                  </Button>
                </div>
              </Card>
            )}

            {/* Направление */}
            {profession && examType === 'test' && mode && examLanguage && (
              <Card title={copy.directionLabel}>
                {directionsLoading ? (
                  <p className="text-sm text-slate-600">{copy.directionsLoading}</p>
                ) : directionsError ? (
                  <p className="text-sm text-rose-500">{copy.directionsEmpty}</p>
                ) : directions.length === 0 ? (
                  <p className="text-sm text-slate-500">{copy.directionsEmpty}</p>
                ) : (
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={direction?.id ?? ''}
                    onChange={(event) => {
                      const selected = directions.find((item) => item.id === event.target.value) ?? null;
                      setDirection(selected);
                      setStartError(null);
                    }}
                  >
                    <option value="" disabled>
                      —
                    </option>
                    {directions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
                {mode === 'practice' && (
                  <p className="mt-2 text-xs text-slate-600">{copy.calmHint}</p>
                )}
              </Card>
            )}

            {/* Устный экзамен заглушка */}
            {profession && examType === 'oral' && (
              <Card>
                <p className="text-sm text-slate-600">{copy.oralStub}</p>
              </Card>
            )}

            {/* Кнопка старта */}
            {canStart && (
              <Button
                size="lg"
                className="w-full"
                onClick={startExam}
                disabled={isStarting}
              >
                {isStarting ? 'Запуск...' : copy.start}
              </Button>
            )}

            {/* Ошибки и информация об оплате */}
            {startError && (
              accessMode === 'one-time' ? (
                <div
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm"
                  role="alert"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600"
                    aria-hidden
                  >
                    ℹ
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {copy.oneTimeTitle}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {copy.oneTimeHint}{' '}
                      {oneTimePrice != null
                        ? `${oneTimePrice.toLocaleString('ru-UZ')} сум.`
                        : '—'}
                    </p>
                    <Button
                      href={
                        direction
                          ? `/cabinet/pay-one-time?examId=${encodeURIComponent(direction.examId)}&mode=${mode ?? 'exam'}`
                          : '/cabinet/pay-one-time'
                      }
                      size="md"
                      className="mt-3 w-full sm:w-auto"
                    >
                      {copy.payCta}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm"
                  role="alert"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-700"
                    aria-hidden
                  >
                    !
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-amber-800">
                      {copy.accessDeniedTitle}
                    </p>
                    <p className="mt-0.5 text-sm text-amber-800">
                      {copy.accessDeniedHint}
                    </p>
                    <Button
                      href="/cabinet/subscribe"
                      size="md"
                      className="mt-3 w-full sm:w-auto"
                    >
                      {copy.subscribeCta}
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}

export default function ExamSelectPage() {
  return (
    <Suspense fallback={null}>
      <ExamSelectClient />
    </Suspense>
  );
}
