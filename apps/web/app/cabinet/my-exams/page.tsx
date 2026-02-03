'use client';

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

export default function MyExamsFlowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessMode = searchParams.get('access') === 'one-time' ? 'one-time' : 'default';
  const [step, setStep] = useState(1);
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

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'My exams',
        subtitle: 'Choose a path and start your next test.',
        tapHint: 'Tap to view available directions.',
        selectedProfession: 'Selected profession:',
        examTypeTitle: 'Exam type',
        test: 'Test',
        oral: 'Oral',
        modeTitle: 'Mode',
        modeExam: 'Submit exam',
        modePractice: 'Practice',
        languageTitle: 'Exam language',
        languageUz: 'Uzbek',
        languageRu: 'Russian',
        directionLabel: 'Direction:',
        directionsLoading: 'Loading directions...',
        directionsEmpty: 'No directions found yet.',
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
        title: 'Mening imtihonlarim',
        subtitle: 'Yo‘l tanlang va testni boshlang.',
        tapHint: 'Yo‘nalishlarni ko‘rish uchun bosing.',
        selectedProfession: 'Tanlangan kasb:',
        examTypeTitle: 'Imtihon turi',
        test: 'Test',
        oral: 'Og‘zaki',
        modeTitle: 'Rejim',
        modeExam: 'Imtihonni topshirish',
        modePractice: 'Tayyorgarlik',
        languageTitle: 'Imtihon tili',
        languageUz: 'O‘zbek',
        languageRu: 'Rus',
        directionLabel: 'Yo‘nalish:',
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
      title: 'Мои экзамены',
      subtitle: 'Выберите направление и начните тест.',
      tapHint: 'Нажмите, чтобы увидеть доступные направления.',
      selectedProfession: 'Выбранная профессия:',
      examTypeTitle: 'Тип экзамена',
      test: 'Тест',
      oral: 'Устный',
      modeTitle: 'Режим',
      modeExam: 'Сдать тест',
      modePractice: 'Готовиться к тесту',
      languageTitle: 'Язык экзамена',
      languageUz: 'Узбекский',
      languageRu: 'Русский',
      directionLabel: 'Направление:',
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

  function selectProfession(choice: ProfessionKey) {
    setStartError(null);
    setProfession(choice);
    setExamType(null);
    setMode(null);
    setExamLanguage(null);
    setDirection(null);
    setDirections([]);
    setStep(2);
  }

  function selectExamType(choice: ExamTypeKey) {
    setStartError(null);
    setExamType(choice);
    setMode(null);
    setExamLanguage(null);
    setDirection(null);
    setDirections([]);
    if (choice === 'oral') {
      setStep(6);
      return;
    }
    setStep(3);
  }

  function selectMode(choice: ExamModeKey) {
    setStartError(null);
    setMode(choice);
    setExamLanguage(null);
    setDirection(null);
    setDirections([]);
    setStep(4);
  }

  async function selectLanguage(choice: ExamLanguageKey) {
    setStartError(null);
    setExamLanguage(choice);
    setDirection(null);
    setDirections([]);
    setDirectionsLoading(true);
    setDirectionsError(false);
    setStep(5);
    if (!profession || !examType) return;
    const professionParam = profession === 'doctors' ? 'DOCTOR' : 'NURSE';
    const languageParam = choice === 'uz' ? 'UZ' : 'RU';
    const typeParam = examType === 'test' ? 'TEST' : 'ORAL';
    const { response, data } = await apiFetch(
      `/exams/directions?profession=${professionParam}&language=${languageParam}&type=${typeParam}`
    );
    if (!response.ok) {
      setDirectionsError(true);
      setDirectionsLoading(false);
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
    setDirectionsLoading(false);
  }

  function selectDirection(optionId: string) {
    setStartError(null);
    const selected = directions.find((item) => item.id === optionId) ?? null;
    setDirection(selected);
  }

  function startExam() {
    if (!direction || !mode) return;
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
      }
    })();
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex min-h-[70vh] flex-col gap-6 pb-28 pt-[3.75rem]">
          <BackButton placement="bottom" />
        <PageHeader title={copy.title} subtitle={copy.subtitle} />

        {step === 1 && (
          <div className="flex flex-1 items-center justify-center">
            <div className="grid w-full max-w-md grid-cols-2 gap-4">
              {Object.entries(professionLabels).map(([key, label]) => (
                <Card
                  key={key}
                  className="cursor-pointer border border-slate-200 bg-white px-5 py-5 text-left transition hover:border-slate-300"
                >
                  <button
                    type="button"
                    onClick={() => selectProfession(key as ProfessionKey)}
                    className="flex w-full flex-col items-center gap-4 text-center transition active:scale-[0.98]"
                  >
                    <span className="h-16 w-16 rounded-2xl bg-slate-50 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={key === 'doctors' ? '/icons/doctor.svg' : '/icons/nurse.svg'}
                        alt={key === 'doctors' ? 'Doctor icon' : 'Nurse icon'}
                        className="h-full w-full object-contain"
                      />
                    </span>
                    <span className="text-base font-semibold text-slate-900">
                    {professionLabels[key as ProfessionKey]}
                    </span>
                    <span className="text-sm text-slate-600">
                    {copy.tapHint}
                    </span>
                  </button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <Card>
              <p className="text-sm text-slate-600">
                {copy.selectedProfession}{' '}
                <span className="font-semibold text-slate-900">
                  {profession ? professionLabels[profession] : '—'}
                </span>
              </p>
            </Card>
            <Card title={copy.examTypeTitle}>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  size="lg"
                  variant={examType === 'test' ? 'primary' : 'secondary'}
                  onClick={() => selectExamType('test')}
                >
                  {copy.test}
                </Button>
                <Button
                  size="lg"
                  variant={examType === 'oral' ? 'primary' : 'secondary'}
                  onClick={() => selectExamType('oral')}
                >
                  {copy.oral}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <Card>
              <p className="text-sm text-slate-600">{copy.modeTitle}</p>
            </Card>
            <div className="grid gap-3">
              <Button
                size="lg"
                variant={mode === 'exam' ? 'primary' : 'secondary'}
                onClick={() => selectMode('exam')}
              >
                {copy.modeExam}
              </Button>
              <Button
                size="lg"
                variant={mode === 'practice' ? 'primary' : 'secondary'}
                onClick={() => selectMode('practice')}
              >
                {copy.modePractice}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <Card>
              <p className="text-sm text-slate-600">{copy.languageTitle}</p>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg"
                variant={examLanguage === 'uz' ? 'primary' : 'secondary'}
                onClick={() => void selectLanguage('uz')}
              >
                {copy.languageUz}
              </Button>
              <Button
                size="lg"
                variant={examLanguage === 'ru' ? 'primary' : 'secondary'}
                onClick={() => void selectLanguage('ru')}
              >
                {copy.languageRu}
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            <Card>
              <p className="text-sm text-slate-600">{copy.directionLabel}</p>
              {directionsLoading ? (
                <p className="mt-2 text-xs text-slate-500">
                  {copy.directionsLoading}
                </p>
              ) : directionsError ? (
                <p className="mt-2 text-xs text-rose-500">
                  {copy.directionsEmpty}
                </p>
              ) : (
              <select
                className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                value={direction?.id ?? ''}
                onChange={(event) => selectDirection(event.target.value)}
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
              <p className="mt-2 text-xs text-slate-600">{copy.calmHint}</p>
            </Card>
            <Button
              size="lg"
              className="w-full"
              onClick={startExam}
              disabled={!direction}
            >
              {copy.start}
            </Button>
            {startError ? (
              accessMode === 'one-time' ? (
                <div
                  className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm"
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
                  className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm"
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
            ) : null}
          </div>
        )}

        {step === 6 && (
          <div className="flex flex-col gap-4">
            <Card>
              <p className="text-sm text-slate-600">{copy.oralStub}</p>
            </Card>
          </div>
        )}
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
