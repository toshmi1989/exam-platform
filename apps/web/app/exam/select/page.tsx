'use client';

import { Suspense } from 'react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import { readSettings, Language } from '../../../lib/uiSettings';
import { apiFetch } from '../../../lib/api/client';
import { createAttempt, startAttempt, getProfile } from '../../../lib/api';
import { readTelegramUser } from '../../../lib/telegramUser';
import { getOpenInTelegramAppUrl } from '../../../lib/telegram';

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

type OrderModeKey = 'random' | 'order';
type OralModeKey = 'preparation' | 'exam';

interface OralDirectionGroup {
  direction: string;
  exams: { id: string; categoryLabel: string }[];
}

interface OralExamOption {
  id: string;
  categoryLabel: string;
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
  const [orderMode, setOrderMode] = useState<OrderModeKey | null>(null);
  const [oralMode, setOralMode] = useState<OralModeKey | null>(null);
  const [oralDirections, setOralDirections] = useState<OralDirectionGroup[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const [selectedOralExam, setSelectedOralExam] = useState<OralExamOption | null>(null);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [directionsError, setDirectionsError] = useState(false);
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [startError, setStartError] = useState<string | null>(null);
  const [oneTimePrice, setOneTimePrice] = useState<number | null>(null);
  const [subscriptionPrice, setSubscriptionPrice] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isGuest, setIsGuest] = useState<boolean>(false);
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
    // Check if user is a guest
    const user = readTelegramUser();
    const isGuestUser = !user?.telegramId || user.telegramId.startsWith('guest-');
    setIsGuest(isGuestUser);

    getProfile()
      .then((p) => {
        setOneTimePrice(p.oneTimePrice ?? null);
        setSubscriptionPrice(p.subscriptionPrice ?? null);
        setIsAuthenticated(true);
      })
      .catch(() => {
        setOneTimePrice(null);
        setSubscriptionPrice(null);
        setIsAuthenticated(false);
      });
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
    setSelectedDirection(null);
    setSelectedOralExam(null);
    setOralDirections([]);
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
      const payload = data as {
        directions?: { id?: string; label?: string; direction?: string; exams?: { id: string; categoryLabel: string }[] }[];
      } | null;
      const list = payload?.directions ?? [];
      if (typeParam === 'ORAL') {
        setOralDirections(
          list.map((entry) => ({
            direction: entry.direction ?? '',
            exams: entry.exams ?? [],
          }))
        );
        setDirections([]);
      } else {
        const testList = list as Array<{ id?: string; label?: string }>;
        setDirections(
          testList.map((entry) => ({
            id: entry.id ?? '',
            label: entry.label ?? entry.id ?? '',
            examId: entry.id ?? '',
          }))
        );
        setOralDirections([]);
      }
    } catch {
      setDirectionsError(true);
      setDirections([]);
      setOralDirections([]);
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
        dailyLimitExhaustedTitle: 'Daily limit used',
        dailyLimitExhaustedHint: 'Your free attempts for today are used. Get a subscription to continue.',
        guestLimitHint: 'Limit exhausted. To continue, make a one-time payment for 1 session or buy a subscription in your Telegram account!',
        goToTelegramCta: 'Go to Telegram',
        buySubscriptionCta: 'Get subscription',
        subscribeCta: 'Get subscription',
        subscribeCtaFor: 'Get subscription for',
        oneTimeCtaFor: 'One-time access for',
        loginToPurchase: 'Log in to purchase access.',
        oneTimeTitle: 'One-time access',
        oneTimeHint: 'One-time access to this test costs',
        payCta: 'Pay and start test',
        orderModeTitle: 'Question order',
        orderRandom: 'Random',
        orderSequential: 'In order',
        categoryLabel: 'Category',
        startOral: 'Start oral',
        selectPlaceholder: 'Select',
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
        dailyLimitExhaustedTitle: 'Kunlik limit tugadi',
        dailyLimitExhaustedHint: 'Bepul urinishlar bugun tugadi. Davom etish uchun obuna oling.',
        guestLimitHint: "Limit tugadi. Davom etish uchun 1 seans uchun bir martalik to'lov qiling yoki Telegramdagi shaxsiy kabinetingizda obuna oling!",
        goToTelegramCta: "Telegramga o'tish",
        buySubscriptionCta: 'Obuna olish',
        subscribeCta: 'Obuna olish',
        subscribeCtaFor: 'Obuna olish',
        oneTimeCtaFor: 'Bir martalik kirish',
        loginToPurchase: 'Kirish sotib olish uchun tizimga kiring.',
        oneTimeTitle: 'Bir martalik kirish',
        oneTimeHint: 'Bu test uchun bir martalik kirish narxi',
        payCta: 'To‘lash va testni boshlash',
        orderModeTitle: 'Savollar tartibi',
        orderRandom: 'Tasodifiy',
        orderSequential: 'Ketma-ket',
        categoryLabel: 'Kategoriya',
        startOral: "Og'zaki boshlash",
        selectPlaceholder: 'Tanlang',
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
      dailyLimitExhaustedTitle: 'Дневной лимит исчерпан',
      dailyLimitExhaustedHint: 'Бесплатные попытки на сегодня израсходованы. Для продолжения нужна подписка.',
      guestLimitHint: 'Лимит закончился. Для продолжения совершите разовый платёж для 1 сеанса или купите подписку в личном кабинете с Telegram!',
      goToTelegramCta: 'Перейти в Telegram',
      buySubscriptionCta: 'Купить подписку',
      subscribeCta: 'Оформить подписку',
      subscribeCtaFor: 'Оформить подписку за',
      oneTimeCtaFor: 'Разовый доступ за',
      loginToPurchase: 'Войдите в аккаунт, чтобы оформить подписку или оплатить доступ.',
      oneTimeTitle: 'Разовый доступ',
      oneTimeHint: 'Разовый доступ к этому тесту стоит',
      payCta: 'Оплатить и начать тест',
      orderModeTitle: 'Порядок вопросов',
      orderRandom: 'Рандомно',
      orderSequential: 'По очереди',
      categoryLabel: 'Категория',
      startOral: 'Начать устный',
      selectPlaceholder: 'Выберите',
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

  function startOral() {
    if (!selectedOralExam || !orderMode || isStarting) return;
    router.push(`/exam/oral/${selectedOralExam.id}?order=${orderMode}`);
  }

  const canStartTest =
    profession && examType === 'test' && mode && examLanguage && direction && !directionsLoading;
  const canStartOral =
    profession &&
    examType === 'oral' &&
    oralMode === 'preparation' &&
    orderMode &&
    examLanguage &&
    selectedDirection &&
    selectedOralExam &&
    !directionsLoading;
  const canStart = canStartTest || canStartOral;

  // Refs for scrolling
  const examTypeRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const languageRef = useRef<HTMLDivElement>(null);
  const directionRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const startSectionRef = useRef<HTMLDivElement>(null);
  const startErrorRef = useRef<HTMLDivElement>(null);

  // When access denied / payment required — scroll notification into view so it's visible
  useEffect(() => {
    if (!startError) return;
    const t = setTimeout(() => {
      startErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => clearTimeout(t);
  }, [startError]);

  // Scroll to center when step changes
  useEffect(() => {
    let ref: React.RefObject<HTMLDivElement | null> | null = null;
    if (profession && !examType) {
      ref = examTypeRef as React.RefObject<HTMLDivElement>;
    } else if (profession && examType === 'test' && !mode) {
      ref = modeRef as React.RefObject<HTMLDivElement>;
    } else if (profession && examType === 'oral' && !oralMode) {
      ref = modeRef as React.RefObject<HTMLDivElement>;
    } else if (profession && examType === 'oral' && oralMode === 'preparation' && !orderMode) {
      ref = modeRef as React.RefObject<HTMLDivElement>;
    } else if (profession && examType === 'test' && mode && !examLanguage) {
      ref = languageRef as React.RefObject<HTMLDivElement>;
    } else if (profession && examType === 'oral' && oralMode === 'preparation' && orderMode && !examLanguage) {
      ref = languageRef as React.RefObject<HTMLDivElement>;
    } else if (profession && examType === 'test' && mode && examLanguage && !direction) {
      ref = directionRef as React.RefObject<HTMLDivElement>;
    } else if (profession && examType === 'oral' && oralMode === 'preparation' && orderMode && examLanguage && !selectedDirection) {
      ref = directionRef as React.RefObject<HTMLDivElement>;
    } else if (profession && examType === 'oral' && oralMode === 'preparation' && orderMode && examLanguage && selectedDirection && !selectedOralExam) {
      ref = categoryRef;
    } else if (canStart) {
      ref = startSectionRef;
    }

    if (ref?.current) {
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [profession, examType, mode, oralMode, orderMode, examLanguage, direction, selectedDirection, selectedOralExam, canStart]);

  return (
    <>
      <AnimatedPage>
        <main className="flex min-h-[70vh] flex-col gap-6 pb-28 pt-[3.75rem]">
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
              <div ref={examTypeRef}>
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
                      setOralMode(null);
                      setOrderMode(null);
                      setExamLanguage(null);
                      setDirection(null);
                      setSelectedDirection(null);
                      setSelectedOralExam(null);
                      setStartError(null);
                    }}
                  >
                    {copy.oral}
                  </Button>
                </div>
              </Card>
              </div>
            )}

            {/* Oral mode (oral only) */}
            {profession && examType === 'oral' && !oralMode && (
              <div ref={modeRef}>
                <Card title="Режим">
                  <div className="grid gap-3">
                    <Button
                      size="lg"
                      variant={oralMode === 'exam' ? 'primary' : 'secondary'}
                      onClick={() => {
                        setOralMode('exam');
                        setStartError(null);
                      }}
                    >
                      🧑‍⚕️ Сдать устный
                    </Button>
                    <Button
                      size="lg"
                      variant={oralMode === 'preparation' ? 'primary' : 'secondary'}
                      onClick={() => {
                        setOralMode('preparation');
                        setOrderMode(null);
                        setExamLanguage(null);
                        setSelectedDirection(null);
                        setSelectedOralExam(null);
                        setStartError(null);
                      }}
                    >
                      📚 Готовиться к устному
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Placeholder for "Сдать устный" mode */}
            {profession && examType === 'oral' && oralMode === 'exam' && (
              <div ref={modeRef}>
                <Card>
                  <div className="flex flex-col gap-4">
                    <h3 className="text-lg font-semibold text-slate-800">Режим «Сдать устный»</h3>
                    <p className="text-slate-600">
                      Скоро будет доступно.
                      <br />
                      Вы сможете сдавать устный экзамен вживую,
                      <br />
                      а ваши ответы будут автоматически оценены.
                    </p>
                    <Button
                      size="lg"
                      onClick={() => {
                        setOralMode(null);
                        setStartError(null);
                      }}
                    >
                      Вернуться
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Order mode (oral preparation only) */}
            {profession && examType === 'oral' && oralMode === 'preparation' && !orderMode && (
              <div ref={modeRef}>
                <Card title={copy.orderModeTitle}>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      size="lg"
                      variant={orderMode === 'random' ? 'primary' : 'secondary'}
                      onClick={() => {
                        setOrderMode('random');
                        setExamLanguage(null);
                        setSelectedDirection(null);
                        setSelectedOralExam(null);
                        setStartError(null);
                      }}
                    >
                      {copy.orderRandom}
                    </Button>
                    <Button
                      size="lg"
                      variant={orderMode === 'order' ? 'primary' : 'secondary'}
                      onClick={() => {
                        setOrderMode('order');
                        setExamLanguage(null);
                        setSelectedDirection(null);
                        setSelectedOralExam(null);
                        setStartError(null);
                      }}
                    >
                      {copy.orderSequential}
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Режим (test only) */}
            {profession && examType === 'test' && (
              <div ref={modeRef}>
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
              </div>
            )}

            {/* Язык */}
            {(profession && examType === 'test' && mode) || (profession && examType === 'oral' && oralMode === 'preparation' && orderMode) ? (
              <div ref={languageRef}>
                <Card title={copy.languageTitle}>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    variant={examLanguage === 'uz' ? 'primary' : 'secondary'}
                    onClick={() => {
                      setExamLanguage('uz');
                      setDirection(null);
                      setSelectedDirection(null);
                      setSelectedOralExam(null);
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
                      setSelectedDirection(null);
                      setSelectedOralExam(null);
                      setStartError(null);
                    }}
                  >
                    {copy.languageRu}
                  </Button>
                </div>
              </Card>
              </div>
            ) : null}

            {/* Направление (test) */}
            {profession && examType === 'test' && mode && examLanguage && (
              <div ref={directionRef}>
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
                      {copy.selectPlaceholder}
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
              </div>
            )}

            {/* Направление + Категория (oral) */}
            {profession && examType === 'oral' && orderMode && examLanguage && (
              <div ref={directionRef}>
                <Card title={copy.directionLabel}>
                  {directionsLoading ? (
                    <p className="text-sm text-slate-600">{copy.directionsLoading}</p>
                  ) : directionsError || oralDirections.length === 0 ? (
                    <p className="text-sm text-slate-500">{copy.directionsEmpty}</p>
                  ) : (
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={selectedDirection ?? ''}
                      onChange={(e) => {
                        setSelectedDirection(e.target.value || null);
                        setSelectedOralExam(null);
                        setStartError(null);
                      }}
                    >
                      <option value="" disabled>{copy.selectPlaceholder}</option>
                      {oralDirections.map((g) => (
                        <option key={g.direction} value={g.direction}>
                          {g.direction}
                        </option>
                      ))}
                    </select>
                  )}
                </Card>
                {selectedDirection && (
                  <div ref={categoryRef}>
                  <Card title={copy.categoryLabel} className="mt-4">
                    {(() => {
                      const group = oralDirections.find((g) => g.direction === selectedDirection);
                      const exams = group?.exams ?? [];
                      if (exams.length === 0) return <p className="text-sm text-slate-500">—</p>;
                      return (
                        <select
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          value={selectedOralExam?.id ?? ''}
                          onChange={(e) => {
                            const opt = exams.find((ex) => ex.id === e.target.value);
                            setSelectedOralExam(opt ?? null);
                            setStartError(null);
                          }}
                        >
                          <option value="" disabled>{copy.selectPlaceholder}</option>
                          {exams.map((ex) => (
                            <option key={ex.id} value={ex.id}>
                              {ex.categoryLabel}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </Card>
                  </div>
                )}
              </div>
            )}

            {/* Кнопка старта */}
            {canStart && (
              <div ref={startSectionRef}>
              <Button
                size="lg"
                className="w-full"
                onClick={canStartOral ? startOral : startExam}
                disabled={isStarting}
              >
                {isStarting ? 'Запуск...' : canStartOral ? copy.startOral : copy.start}
              </Button>
              </div>
            )}

            {/* Ошибки и информация об оплате */}
            {startError && (
              <div ref={startErrorRef}>
              {accessMode === 'one-time' ? (
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
                      {copy.dailyLimitExhaustedTitle}
                    </p>
                    <p className="mt-0.5 text-sm text-amber-800">
                      {isGuest
                        ? ((copy as { guestLimitHint?: string }).guestLimitHint ?? copy.dailyLimitExhaustedHint)
                        : copy.dailyLimitExhaustedHint}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isAuthenticated && !isGuest && (
                        <>
                          <Button
                            href="/cabinet/subscribe"
                            size="md"
                            className="w-full sm:w-auto"
                          >
                            {subscriptionPrice != null
                              ? `${copy.subscribeCtaFor} ${subscriptionPrice.toLocaleString('ru-UZ')} сум`
                              : copy.buySubscriptionCta}
                          </Button>
                          <Button
                            href={
                              direction
                                ? `/cabinet/pay-one-time?examId=${encodeURIComponent(direction.examId)}&mode=${mode ?? 'exam'}`
                                : '/cabinet/pay-one-time'
                            }
                            size="md"
                            variant="secondary"
                            className="w-full sm:w-auto"
                          >
                            {oneTimePrice != null
                              ? `${copy.oneTimeCtaFor} ${oneTimePrice.toLocaleString('ru-UZ')} сум`
                              : copy.payCta}
                          </Button>
                        </>
                      )}
                      {(isGuest || (!isAuthenticated && !isGuest)) && (
                        <>
                          {isGuest ? (
                            <>
                              <Button
                                href={
                                  direction
                                    ? `/cabinet/pay-one-time?examId=${encodeURIComponent(direction.examId)}&mode=${mode ?? 'exam'}`
                                    : '/cabinet/pay-one-time'
                                }
                                size="md"
                                variant="secondary"
                                className="w-full sm:w-auto"
                              >
                                {oneTimePrice != null
                                  ? `${copy.oneTimeCtaFor} ${oneTimePrice.toLocaleString('ru-UZ')} сум`
                                  : copy.payCta}
                              </Button>
                              <a
                                href={getOpenInTelegramAppUrl()}
                                className="inline-flex w-full sm:w-auto justify-center rounded-xl bg-[#2AABEE] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#229ED9]"
                              >
                                {(copy as { goToTelegramCta?: string }).goToTelegramCta ?? 'Перейти в Telegram'}
                              </a>
                            </>
                          ) : (
                            <Button href="/cabinet" size="md" className="w-full sm:w-auto">
                              {copy.loginToPurchase}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              </div>
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
