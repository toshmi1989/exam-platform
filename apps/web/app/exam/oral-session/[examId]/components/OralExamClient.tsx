'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Button from '../../../../../components/Button';
import Card from '../../../../../components/Card';
import PageHeader from '../../../../../components/PageHeader';
import Recorder from './Recorder';
import FeedbackPanel from './FeedbackPanel';
import { readSettings, Language } from '../../../../../lib/uiSettings';
import {
  startOralSession,
  submitOralAnswer,
  finishOralSession,
} from '../../../../../lib/api';
import type {
  OralSession,
  OralSessionQuestion,
  OralAnswerResult,
  OralSessionResult,
} from '../../../../../lib/types';
import type { ApiError } from '../../../../../lib/api';

type PageState = 'intro' | 'recording' | 'reviewing' | 'submitting' | 'finishing' | 'finished' | 'error';

interface OralExamClientProps {
  examId: string;
}

const TOTAL_SECONDS = 600; // 10 minutes

const COPY_MAP = {
  ru: {
    title: 'Устный экзамен',
    subtitle: 'Режим оценки ответов',
    introTitle: 'Готовы к устному экзамену?',
    introDesc: [
      '5 вопросов по направлению',
      '10 минут на весь экзамен',
      'Нажмите кнопку микрофона и говорите',
      'После каждого ответа — мгновенная оценка',
    ],
    introNote: 'Убедитесь, что находитесь в тихом месте.',
    start: 'Я начинаю',
    loading: 'Подготовка экзамена...',
    question: 'Вопрос',
    of: 'из',
    record: 'Запишите ваш ответ',
    recordHint: 'Нажмите на микрофон, ответьте, нажмите стоп.',
    submitting: 'Оцениваем ваш ответ...',
    nextQuestion: 'Следующий вопрос',
    finishExam: 'Завершить экзамен',
    finishing: 'Подсчитываем баллы...',
    resultTitle: 'Результат устного экзамена',
    passed: 'Сдан',
    failed: 'Не сдан',
    passThreshold: 'Проходной балл: 30 из 50',
    yourScore: 'Ваш балл',
    questionReview: 'Разбор ответов',
    backToExam: 'Назад к экзаменам',
    retake: 'Сдать завтра',
    subscriptionRequired: 'Устный экзамен доступен только с активной подпиской.',
    rateLimitExceeded: 'Вы уже сдали устный экзамен сегодня. Попробуйте завтра.',
    sessionActive: 'У вас уже есть активная сессия. Завершите её.',
    notEnoughQuestions: 'Недостаточно вопросов для экзамена.',
    genericError: 'Произошла ошибка. Попробуйте позже.',
    timeLeft: 'Осталось',
    timeout: 'Время вышло',
    timeoutMsg: 'Время экзамена истекло. Показываем результаты.',
    skipRecord: 'Пропустить',
  },
  uz: {
    title: "Og'zaki imtihon",
    subtitle: "Javoblarni baholash rejimi",
    introTitle: "Og'zaki imtihonga tayyormisiz?",
    introDesc: [
      'Yo\'nalish bo\'yicha 5 ta savol',
      'Butun imtihon uchun 10 daqiqa',
      'Mikrofon tugmasini bosing va gapiring',
      "Har bir javobdan so'ng — tezkor baho",
    ],
    introNote: "Jimjit joyda ekanligingizga ishonch hosil qiling.",
    start: 'Boshlayapman',
    loading: 'Imtihon tayyorlanmoqda...',
    question: 'Savol',
    of: '/',
    record: 'Javobingizni yozib oling',
    recordHint: 'Mikrofonga bosing, javob bering, toʻxtating.',
    submitting: 'Javobingiz baholanmoqda...',
    nextQuestion: 'Keyingi savol',
    finishExam: "Imtihonni tugatish",
    finishing: 'Ballar hisoblanmoqda...',
    resultTitle: "Og'zaki imtihon natijasi",
    passed: 'Topshirildi',
    failed: 'Topshirilmadi',
    passThreshold: "O'tish bali: 30 / 50",
    yourScore: 'Sizning balingiz',
    questionReview: "Javoblar tahlili",
    backToExam: 'Imtihonlarga qaytish',
    retake: 'Ertaga qayta topshirish',
    subscriptionRequired: "Og'zaki imtihon faqat faol obuna bilan mavjud.",
    rateLimitExceeded: "Bugun og'zaki imtihonni allaqachon topshirdingiz. Ertaga urinib ko'ring.",
    sessionActive: 'Faol sessiya mavjud. Uni tugatib oling.',
    notEnoughQuestions: 'Imtihon uchun savollar yetarli emas.',
    genericError: 'Xatolik yuz berdi. Keyinroq urinib ko\'ring.',
    timeLeft: 'Qoldi',
    timeout: 'Vaqt tugadi',
    timeoutMsg: "Imtihon vaqti tugadi. Natijalar ko'rsatilmoqda.",
    skipRecord: "O'tkazib yuborish",
  },
  en: {
    title: 'Oral Exam',
    subtitle: 'Answer evaluation mode',
    introTitle: 'Ready for your oral exam?',
    introDesc: [
      '5 questions from this direction',
      '10 minutes for the entire exam',
      'Tap the mic button and speak',
      'Instant evaluation after each answer',
    ],
    introNote: 'Make sure you are in a quiet environment.',
    start: 'Start exam',
    loading: 'Preparing exam...',
    question: 'Question',
    of: 'of',
    record: 'Record your answer',
    recordHint: 'Tap the mic, answer, then tap stop.',
    submitting: 'Evaluating your answer...',
    nextQuestion: 'Next question',
    finishExam: 'Finish exam',
    finishing: 'Calculating scores...',
    resultTitle: 'Oral Exam Result',
    passed: 'Passed',
    failed: 'Not passed',
    passThreshold: 'Passing score: 30 of 50',
    yourScore: 'Your score',
    questionReview: 'Answer breakdown',
    backToExam: 'Back to exams',
    retake: 'Retake tomorrow',
    subscriptionRequired: 'Oral exam is available only with an active subscription.',
    rateLimitExceeded: 'You have already taken the oral exam today. Try again tomorrow.',
    sessionActive: 'You have an active session. Please finish it first.',
    notEnoughQuestions: 'Not enough questions for the exam.',
    genericError: 'An error occurred. Please try again later.',
    timeLeft: 'Time left',
    timeout: 'Time is up',
    timeoutMsg: 'Exam time expired. Showing results.',
    skipRecord: 'Skip',
  },
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function errorToCopy(
  reasonCode: string | undefined,
  copy: (typeof COPY_MAP)['ru']
): string {
  if (reasonCode === 'SUBSCRIPTION_REQUIRED') return copy.subscriptionRequired;
  if (reasonCode === 'RATE_LIMIT_EXCEEDED') return copy.rateLimitExceeded;
  if (reasonCode === 'SESSION_ALREADY_ACTIVE') return copy.sessionActive;
  if (reasonCode === 'NOT_ENOUGH_QUESTIONS') return copy.notEnoughQuestions;
  return copy.genericError;
}

export default function OralExamClient({ examId }: OralExamClientProps) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [pageState, setPageState] = useState<PageState>('intro');
  const [errorMessage, setErrorMessage] = useState('');

  // Session state
  const [session, setSession] = useState<OralSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OralAnswerResult>>({});
  const [sessionResult, setSessionResult] = useState<OralSessionResult | null>(null);

  // Timer
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const copy = useMemo(() => {
    if (language === 'Узбекский') return COPY_MAP.uz;
    if (language === 'Английский') return COPY_MAP.en;
    return COPY_MAP.ru;
  }, [language]);

  const lang: 'ru' | 'uz' | 'en' = useMemo(() => {
    if (language === 'Узбекский') return 'uz';
    if (language === 'Английский') return 'en';
    return 'ru';
  }, [language]);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  // Timer management
  const startTimer = useCallback((expiresAt: Date) => {
    if (timerRef.current) clearInterval(timerRef.current);

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        handleTimeout();
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  const handleTimeout = useCallback(async () => {
    stopTimer();
    if (!sessionIdRef.current) return;
    setPageState('finishing');
    try {
      const result = await finishOralSession(sessionIdRef.current);
      setSessionResult(result);
      setPageState('finished');
    } catch {
      setPageState('finished');
    }
  }, [stopTimer]);

  // ─── Start exam ────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    setPageState('loading' as PageState);
    try {
      const data = await startOralSession(examId);
      sessionIdRef.current = data.sessionId;
      setSession(data);
      setCurrentIndex(0);
      setAnswers({});
      startTimer(new Date(data.expiresAt));
      setPageState('recording');
    } catch (err) {
      const apiErr = err as ApiError;
      setErrorMessage(errorToCopy(apiErr.reasonCode, copy));
      setPageState('error');
    }
  }, [examId, copy, startTimer]);

  // ─── Submit answer ─────────────────────────────────────────────────────────

  const handleRecordingComplete = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (!session || !sessionIdRef.current) return;
      const question = session.questions[currentIndex];
      if (!question) return;

      setPageState('submitting');
      try {
        const result = await submitOralAnswer(sessionIdRef.current, question.id, blob);
        setAnswers((prev) => ({ ...prev, [question.id]: result }));
        setPageState('reviewing');
      } catch (err) {
        const apiErr = err as ApiError;
        if (
          apiErr.reasonCode === 'SESSION_EXPIRED' ||
          apiErr.reasonCode === 'SESSION_ENDED'
        ) {
          await handleTimeout();
        } else {
          // Store empty result and show reviewing anyway
          setAnswers((prev) => ({
            ...prev,
            [question.id]: {
              transcript: '',
              score: 0,
              maxScore: 10,
              feedback: {
                score: 0,
                maxScore: 10,
                coverage: [],
                missedPoints: [],
                summary: copy.genericError,
              },
            },
          }));
          setPageState('reviewing');
        }
      }
    },
    [session, currentIndex, copy, handleTimeout]
  );

  // ─── Skip question ─────────────────────────────────────────────────────────

  const handleSkip = useCallback(async () => {
    if (!session || !sessionIdRef.current) return;
    const question = session.questions[currentIndex];
    if (!question) return;

    // Submit empty audio (0-byte buffer) — server will score 0
    setPageState('submitting');
    try {
      const emptyBlob = new Blob([], { type: 'audio/webm' });
      const result = await submitOralAnswer(sessionIdRef.current, question.id, emptyBlob);
      setAnswers((prev) => ({ ...prev, [question.id]: result }));
    } catch {
      setAnswers((prev) => ({
        ...prev,
        [question.id]: {
          transcript: '',
          score: 0,
          maxScore: 10,
          feedback: { score: 0, maxScore: 10, coverage: [], missedPoints: [], summary: '' },
        },
      }));
    }
    setPageState('reviewing');
  }, [session, currentIndex]);

  // ─── Next question / Finish ────────────────────────────────────────────────

  const handleNext = useCallback(async () => {
    if (!session || !sessionIdRef.current) return;

    const isLast = currentIndex >= session.questions.length - 1;

    if (isLast) {
      stopTimer();
      setPageState('finishing');
      try {
        const result = await finishOralSession(sessionIdRef.current);
        setSessionResult(result);
        setPageState('finished');
      } catch {
        setPageState('finished');
      }
    } else {
      setCurrentIndex((i) => i + 1);
      setPageState('recording');
    }
  }, [session, currentIndex, stopTimer]);

  // ─── Render helpers ────────────────────────────────────────────────────────

  const currentQuestion: OralSessionQuestion | undefined = session?.questions[currentIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const isLast = session ? currentIndex >= session.questions.length - 1 : false;

  const timerColor =
    secondsLeft > 120
      ? 'text-slate-600'
      : secondsLeft > 60
      ? 'text-amber-600'
      : 'text-rose-600 font-bold animate-pulse';

  // ─── Renders ──────────────────────────────────────────────────────────────

  if (pageState === 'intro' || (pageState as string) === 'loading') {
    return (
      <main className="flex min-h-screen flex-col gap-6 pb-8 pt-[3.75rem]">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />

        <Card>
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100 text-4xl">
              🎤
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{copy.introTitle}</h2>
              <ul className="mt-3 flex flex-col gap-1.5 text-left">
                {copy.introDesc.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="text-indigo-500">✓</span>
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-500">{copy.introNote}</p>
            </div>

            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleStart}
              disabled={(pageState as string) === 'loading'}
              className="w-full"
            >
              {(pageState as string) === 'loading' ? copy.loading : copy.start}
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  if (pageState === 'error') {
    return (
      <main className="flex min-h-screen flex-col gap-6 pb-8 pt-[3.75rem]">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <Card>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="text-sm text-slate-700">{errorMessage}</p>
            <Button variant="secondary" size="md" onClick={() => router.back()}>
              {copy.backToExam}
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  if (pageState === 'finishing' || !session) {
    return (
      <main className="flex min-h-screen flex-col gap-6 pb-8 pt-[3.75rem]">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <Card>
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm text-slate-600">{copy.finishing}</p>
          </div>
        </Card>
      </main>
    );
  }

  if (pageState === 'finished' && sessionResult) {
    const pct = Math.round((sessionResult.score / sessionResult.maxScore) * 100);
    const passColor = sessionResult.passed ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50';
    const scoreColor = sessionResult.passed ? 'text-emerald-700' : 'text-rose-700';
    const barColor = sessionResult.passed ? 'bg-emerald-500' : 'bg-rose-400';

    return (
      <main className="flex min-h-screen flex-col gap-6 pb-8 pt-[3.75rem]">
        <PageHeader title={copy.resultTitle} subtitle="" />

        {/* Score card */}
        <div className={`rounded-2xl border-2 p-5 ${passColor}`}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">{copy.yourScore}</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
                sessionResult.passed ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
              }`}
            >
              {sessionResult.passed ? '✓' : '✗'}{' '}
              {sessionResult.passed ? copy.passed : copy.failed}
            </span>
          </div>
          <div className="flex items-end justify-center gap-1 py-2">
            <span className={`text-6xl font-extrabold leading-none ${scoreColor}`}>
              {sessionResult.score}
            </span>
            <span className="mb-1 text-2xl font-semibold text-slate-400">
              / {sessionResult.maxScore}
            </span>
          </div>
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/60">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">{copy.passThreshold}</p>
        </div>

        {/* Per-question breakdown */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700">{copy.questionReview}</h3>
          {sessionResult.answers.map((ans, i) => (
            <Card key={ans.questionId} title={`${copy.question} ${i + 1}`}>
              <p className="mb-3 text-sm text-slate-700">{ans.questionText}</p>
              <FeedbackPanel
                transcript={ans.transcript}
                score={ans.score}
                maxScore={10}
                feedback={ans.feedback}
                lang={lang === 'en' ? 'en' : lang === 'uz' ? 'uz' : 'ru'}
              />
            </Card>
          ))}
        </div>

        <Button variant="secondary" size="md" onClick={() => router.back()}>
          {copy.backToExam}
        </Button>
      </main>
    );
  }

  // Recording / reviewing state
  return (
    <main className="flex min-h-screen flex-col gap-6 pb-8 pt-[3.75rem]">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      {/* Timer + progress */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">
          {copy.question} {currentIndex + 1} {copy.of} {session.questions.length}
        </span>
        <span className={`text-sm tabular-nums ${timerColor}`}>
          ⏱ {formatTime(secondsLeft)}
        </span>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5">
        {session.questions.map((q, i) => {
          const answered = answers[q.id] !== undefined;
          const active = i === currentIndex;
          return (
            <div
              key={q.id}
              className={`h-1.5 flex-1 rounded-full ${
                active ? 'bg-indigo-500' : answered ? 'bg-emerald-400' : 'bg-slate-200'
              }`}
            />
          );
        })}
      </div>

      {/* Question card */}
      {currentQuestion && (
        <Card title={`${copy.question} ${currentIndex + 1}`}>
          <p className="text-sm leading-relaxed text-slate-700">{currentQuestion.text}</p>
        </Card>
      )}

      {/* Recording state */}
      {pageState === 'recording' && (
        <Card>
          <p className="mb-1 text-center text-sm font-semibold text-slate-700">{copy.record}</p>
          <p className="mb-5 text-center text-xs text-slate-500">{copy.recordHint}</p>
          <div className="flex justify-center">
            <Recorder
              onRecordingComplete={handleRecordingComplete}
              lang={lang === 'en' ? 'en' : lang}
            />
          </div>
          <button
            type="button"
            onClick={handleSkip}
            className="mt-4 w-full text-center text-xs text-slate-400 underline hover:text-slate-600"
          >
            {copy.skipRecord}
          </button>
        </Card>
      )}

      {/* Submitting spinner */}
      {pageState === 'submitting' && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm text-slate-600">{copy.submitting}</p>
          </div>
        </Card>
      )}

      {/* Reviewing state */}
      {pageState === 'reviewing' && currentAnswer && currentQuestion && (
        <Card>
          <FeedbackPanel
            transcript={currentAnswer.transcript}
            score={currentAnswer.score}
            maxScore={10}
            feedback={currentAnswer.feedback}
            lang={lang === 'en' ? 'en' : lang}
          />
          <div className="mt-6">
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleNext}
              className="w-full"
            >
              {isLast ? copy.finishExam : copy.nextQuestion}
            </Button>
          </div>
        </Card>
      )}
    </main>
  );
}
