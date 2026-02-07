'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import ErrorState from '../../../components/ErrorState';
import PageHeader from '../../../components/PageHeader';
import Timer from '../../../components/Timer';
import AnimatedPage from '../../../components/AnimatedPage';
import { getQuestions, saveAnswer, submitAttempt, streamExplainQuestion } from '../../../lib/api';
import type { ExamQuestion, ApiError } from '../../../lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import AiLoadingDots from '../../../components/AiLoadingDots';
import { readSettings, Language } from '../../../lib/uiSettings';
import { triggerHapticFeedback } from '../../../lib/telegram';
import { readTelegramUser } from '../../../lib/telegramUser';

export default function AttemptPage() {
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();

  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'exam' | 'practice'>('exam');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [warning, setWarning] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(60 * 60);
  const [shakingQuestionId, setShakingQuestionId] = useState<string | null>(null);
  const [ziyodaCache, setZiyodaCache] = useState<Record<string, string>>({});
  const [ziyodaLoadingId, setZiyodaLoadingId] = useState<string | null>(null);
  const [ziyodaError, setZiyodaError] = useState<string | null>(null);
  const [ziyodaAvatarError, setZiyodaAvatarError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [examDirection, setExamDirection] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  function localizeReason(reasonCode?: string) {
    if (!reasonCode) return null;
    const common = {
      ATTEMPT_NOT_FOUND: {
        ru: 'Попытка не найдена.',
        uz: 'Urinish topilmadi.',
        en: 'Attempt not found.',
      },
      ATTEMPT_NOT_STARTED: {
        ru: 'Попытка еще не началась.',
        uz: 'Urinish hali boshlanmagan.',
        en: 'Attempt has not started yet.',
      },
      ATTEMPT_FINISHED: {
        ru: 'Попытка уже завершена.',
        uz: 'Urinish allaqachon yakunlangan.',
        en: 'Attempt is already finished.',
      },
      ATTEMPT_EXPIRED: {
        ru: 'Время попытки истекло.',
        uz: 'Urinish vaqti tugadi.',
        en: 'Attempt time has expired.',
      },
      ATTEMPT_NOT_EDITABLE: {
        ru: 'Нельзя изменять ответы.',
        uz: 'Javoblarni o‘zgartirib bo‘lmaydi.',
        en: 'Answers can no longer be changed.',
      },
      QUESTION_NOT_FOUND: {
        ru: 'Вопрос не найден.',
        uz: 'Savol topilmadi.',
        en: 'Question not found.',
      },
      EXAM_NOT_FOUND: {
        ru: 'Экзамен не найден.',
        uz: 'Imtihon topilmadi.',
        en: 'Exam not found.',
      },
      ACCESS_FORBIDDEN: {
        ru: 'Доступ запрещен.',
        uz: 'Ruxsat yo‘q.',
        en: 'Access forbidden.',
      },
      AUTH_REQUIRED: {
        ru: 'Требуется вход.',
        uz: 'Kirish talab qilinadi.',
        en: 'Authentication required.',
      },
    } as const;

    const langKey =
      language === 'Английский' ? 'en' : language === 'Узбекский' ? 'uz' : 'ru';
    const entry = common[reasonCode as keyof typeof common];
    return entry ? entry[langKey] : null;
  }

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        loading: 'Loading questions…',
        errorTitle: 'Unable to continue',
        errorDefault: 'Please try again.',
        title: 'Exam attempt',
        subtitle: 'Answer one question at a time.',
        questionLabel: 'Question',
        placeholder: 'Type your answer…',
        empty: 'Questions are not available yet.',
        submit: 'Finish test',
        finishTest: 'Finish test',
        timer: 'Time',
        answerAll: 'Please answer all questions first.',
        answerAllExtended: 'To see your result and correct answers you need to answer all questions. If you want to leave and reset this attempt, use the button below.',
        resetAttempt: 'Leave test',
        prev: 'Previous',
        next: 'Next',
        ziyodaAsk: 'Ask Ziyoda',
        ziyodaThinking: 'Ziyoda is thinking…',
        ziyodaError: 'Could not load explanation.',
        submitting: 'Submitting…',
      };
    }
    if (language === 'Узбекский') {
      return {
        loading: 'Savollar yuklanmoqda…',
        errorTitle: 'Davom ettirib bo‘lmaydi',
        errorDefault: 'Qayta urinib ko‘ring.',
        title: 'Imtihon urinish',
        subtitle: 'Savollarga birma-bir javob bering.',
        questionLabel: 'Savol',
        placeholder: 'Javobingizni yozing…',
        empty: 'Savollar hali mavjud emas.',
        submit: 'Imtihonni yakunlash',
        finishTest: 'Imtihonni yakunlash',
        timer: 'Vaqt',
        answerAll: 'Avval barcha savollarga javob bering.',
        answerAllExtended: "Natija va to'g'ri javoblarni ko'rish uchun barcha savollarga javob bering. Agar imtihondan chiqmoqchi bo'lsangiz, quyidagi tugmani bosing.",
        resetAttempt: "Imtihondan chiqish",
        prev: 'Oldingi',
        next: 'Keyingi',
        ziyodaAsk: "Ziyodadan so'rang",
        ziyodaThinking: "Ziyoda o'ylayapti…",
        ziyodaError: 'Tushuntirish yuklanmadi.',
        submitting: 'Yuborilmoqda…',
      };
    }
    return {
      loading: 'Загружаем вопросы…',
      errorTitle: 'Не удалось продолжить',
      errorDefault: 'Пожалуйста, попробуйте снова.',
      title: 'Прохождение экзамена',
      subtitle: 'Отвечайте на вопросы по одному.',
      questionLabel: 'Вопрос',
      placeholder: 'Введите ответ…',
      empty: 'Вопросы пока недоступны.',
      submit: 'Завершить тест',
      finishTest: 'Завершить тест',
      timer: 'Время',
      answerAll: 'Сначала ответьте на все вопросы.',
      answerAllExtended: 'Для просмотра результата и правильных ответов нужно ответить на все вопросы. Или если хотите сбросить сессию — выйдите из режима теста (кнопка ниже).',
      resetAttempt: 'Сбросить',
      prev: 'Предыдущий',
        next: 'Следующий',
        ziyodaAsk: 'Спросить Зиёду',
        ziyodaThinking: 'Зиёда думает…',
        ziyodaError: 'Не удалось загрузить объяснение.',
        submitting: 'Отправка…',
    };
  }, [language]);

  async function handleZiyodaClick(questionId: string) {
    if (ziyodaCache[questionId]?.length || ziyodaLoadingId) return;
    setZiyodaLoadingId(questionId);
    setZiyodaError(null);
    setZiyodaCache((prev) => ({ ...prev, [questionId]: '' }));
    try {
      await streamExplainQuestion(
        questionId,
        (content) => setZiyodaCache((prev) => ({ ...prev, [questionId]: (prev[questionId] ?? '') + content })),
        () => setZiyodaLoadingId(null)
      );
    } catch {
      setZiyodaError(copy.ziyodaError);
      setZiyodaLoadingId(null);
    }
  }

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const questionsScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    async function loadQuestions() {
      try {
        const data = await getQuestions(params.attemptId);
        setQuestions(data.questions);
        if (data.mode) setMode(data.mode);
        if (data.examDirection != null) setExamDirection(data.examDirection);
        else if (data.examTitle != null) setExamDirection(data.examTitle);
      } catch (err) {
        setError(err as ApiError);
      } finally {
        setLoading(false);
      }
    }

    loadQuestions();
  }, [params.attemptId]);

  useEffect(() => {
    const user = readTelegramUser();
    setUserName((user?.firstName || user?.username || '').trim());
  }, []);

  const attemptSubtitle = useMemo(() => {
    const dir = (examDirection || '').trim();
    if (userName && dir) return `${userName} · ${dir}`;
    if (dir) return dir;
    if (userName) return userName;
    return copy.subtitle;
  }, [userName, examDirection, copy.subtitle]);

  useEffect(() => {
    const idx = questions.length > 0 ? Math.min(Math.max(0, currentIndex), questions.length - 1) : 0;
    const current = questions[idx];
    const button = current ? cardRefs.current[current.id] : null;
    const container = questionsScrollRef.current;
    if (!button || !container) return;
    const containerWidth = container.offsetWidth;
    const scrollWidth = container.scrollWidth;
    // Горизонтальный скролл: центрируем активную карточку (мобильный вид)
    if (scrollWidth > containerWidth) {
      const btnLeft = button.offsetLeft;
      const btnWidth = button.offsetWidth;
      const targetScroll = btnLeft - containerWidth / 2 + btnWidth / 2;
      container.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
    } else {
      button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [currentIndex, questions]);

  // Сбрасываем трясение при переходе на новый вопрос
  useEffect(() => {
    setShakingQuestionId(null);
  }, [currentIndex]);

  // При выходе currentIndex за границы (например после быстрых кликов) возвращаем в допустимый диапазон
  useEffect(() => {
    if (questions.length === 0) return;
    const maxIndex = questions.length - 1;
    if (currentIndex > maxIndex || currentIndex < 0) {
      setCurrentIndex(Math.min(Math.max(0, currentIndex), maxIndex));
    }
  }, [currentIndex, questions.length]);

  async function handleAnswerChange(questionId: string, value: string, isChoice?: boolean, optionId?: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setWarning(null);

    // Вибрация и трясение интерфейса при неправильном ответе в режиме practice
    if (mode === 'practice' && isChoice && optionId) {
      const question = questions.find((q) => q.id === questionId);
      if (question?.correctOptionId && optionId !== question.correctOptionId) {
        triggerHapticFeedback('medium');
        setShakingQuestionId(questionId);
        setTimeout(() => setShakingQuestionId(null), 400);
      }
    }

    // В режиме экзамена при выборе варианта сохраняем ответ сразу, затем переходим к следующему вопросу.
    // Иначе при быстром клике по следующему вопросу таймер отменяется и предыдущий ответ не сохраняется.
    if (mode === 'exam' && isChoice) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      try {
        await saveAnswer(params.attemptId, questionId, value);
      } catch (err) {
        setError(err as ApiError);
        return;
      }
      // Переход только на следующий вопрос, не дальше последнего (защита от быстрых кликов)
      setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
      return;
    }

    // Режим практики или текстовый ответ — сохраняем с задержкой (дебаунс)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveAnswer(params.attemptId, questionId, value);
      } catch (err) {
        setError(err as ApiError);
      }
      saveTimeoutRef.current = null;
    }, 400);
  }

  async function handlePrimaryAction() {
    if (mode === 'exam') {
      const firstUnansweredIndex = questions.findIndex(
        (question) => !answers[question.id]
      );
      if (firstUnansweredIndex !== -1) {
        setWarning(copy.answerAllExtended);
        setCurrentIndex(firstUnansweredIndex);
        return;
      }
    }

    setIsSubmitting(true);
    setWarning(null);
    try {
      await submitAttempt(params.attemptId);
      router.push(`/attempt/${params.attemptId}/result`);
    } catch (err) {
      setError(err as ApiError);
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">{copy.loading}</p>;
  }

  if (error) {
    const localized = localizeReason(error.reasonCode);
    return (
      <ErrorState
        title={copy.errorTitle}
        description={localized ?? error.reasonCode ?? copy.errorDefault}
      />
    );
  }

  const totalQuestions = questions.length;
  // Индекс в границах списка: при быстрых кликах currentIndex мог выйти за пределы
  const safeIndex = totalQuestions > 0 ? Math.min(Math.max(0, currentIndex), totalQuestions - 1) : 0;
  const currentQuestion = questions[safeIndex];

  return (
    <AnimatedPage>
      <main className="flex min-h-screen flex-col px-4 py-6 pb-24">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <PageHeader
            title={copy.title}
            subtitle={attemptSubtitle}
          />

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {copy.questionLabel} {safeIndex + 1} / {totalQuestions}
            </span>
            <Timer label={copy.timer} remainingSeconds={remainingSeconds} />
          </div>

          {/* На мобильном — одна строка с горизонтальным скроллом, активный по центру; с md — сетка */}
          <div
            ref={questionsScrollRef}
            className="-mx-4 max-w-[100vw] overflow-x-auto overflow-y-hidden px-4 scroll-smooth md:mx-0 md:max-w-none md:overflow-visible md:px-0"
          >
            <div className="flex min-w-max gap-2 pb-1 flex-nowrap md:min-w-0 md:flex-wrap">
              {questions.map((question, index) => {
                const answered = Boolean(answers[question.id]);
                const active = index === safeIndex;
                const isPractice = mode === 'practice';
                const answeredCorrect =
                  isPractice &&
                  answered &&
                  question.correctOptionId &&
                  answers[question.id] === question.correctOptionId;
                const answeredWrong =
                  isPractice &&
                  answered &&
                  question.correctOptionId &&
                  answers[question.id] !== question.correctOptionId;
                return (
                  <button
                    key={question.id}
                    ref={(el) => {
                      cardRefs.current[question.id] = el;
                    }}
                    type="button"
                    onClick={() => {
                      setWarning(null);
                      setZiyodaError(null);
                      setCurrentIndex(index);
                    }}
                    className={`shrink-0 min-w-[2.5rem] rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : answeredCorrect
                          ? 'border-emerald-400 bg-emerald-100 text-emerald-800'
                          : answeredWrong
                            ? 'border-rose-400 bg-rose-100 text-rose-800'
                            : answered
                              ? 'border-blue-400 bg-blue-100 text-blue-800'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Question */}
        <AnimatePresence mode="wait">
          {currentQuestion ? (
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={`mt-6 ${shakingQuestionId === currentQuestion.id ? 'shake' : ''}`}
            >
              <Card title={`${copy.questionLabel} ${safeIndex + 1}`}>
                <p className="text-sm text-slate-700">
                  {currentQuestion.text}
                </p>

                {currentQuestion.options ? (
                  <div className="mt-4 flex flex-col gap-2">
                    {currentQuestion.options.map((option) => {
                      const selected = answers[currentQuestion.id] === option.id;
                      const isPractice = mode === 'practice';
                      const hasSelection = Boolean(answers[currentQuestion.id]);
                      const isCorrect =
                        isPractice &&
                        hasSelection &&
                        currentQuestion.correctOptionId === option.id;
                      const isWrong =
                        isPractice &&
                        hasSelection &&
                        selected &&
                        currentQuestion.correctOptionId !== option.id;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            handleAnswerChange(currentQuestion.id, option.id, true, option.id)
                          }
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                            isCorrect
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : isWrong
                                ? 'border-rose-300 bg-rose-50 text-rose-700'
                                : selected
                                  ? 'border-blue-500 bg-blue-100 text-blue-900'
                                  : 'border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {option.text}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    className="mt-4 w-full rounded-xl border border-slate-200 p-4 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                    rows={5}
                    placeholder={copy.placeholder}
                    value={answers[currentQuestion.id] ?? ''}
                    onChange={(e) =>
                      handleAnswerChange(currentQuestion.id, e.target.value)
                    }
                  />
                )}

                <div className="mt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    disabled={ziyodaLoadingId === currentQuestion.id}
                    onClick={() => handleZiyodaClick(currentQuestion.id)}
                  >
                    🧠 {copy.ziyodaAsk}
                  </Button>
                  {ziyodaLoadingId === currentQuestion.id && (
                    <div className="mt-2">
                      <AiLoadingDots text={copy.ziyodaThinking} />
                    </div>
                  )}
                  {ziyodaError && ziyodaLoadingId !== currentQuestion.id && (
                    <p className="mt-2 text-sm text-rose-600">{ziyodaError}</p>
                  )}
                  {(ziyodaCache[currentQuestion.id] !== undefined || ziyodaLoadingId === currentQuestion.id) && (
                    <div className="mt-3 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#2AABEE] flex items-center justify-center text-white font-semibold text-lg">
                        {ziyodaAvatarError ? (
                          <span aria-hidden="true">З</span>
                        ) : (
                          <img
                            src="/ziyoda-avatar.png"
                            alt="Зиёда"
                            className="h-full w-full object-cover"
                            onError={() => setZiyodaAvatarError(true)}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-sm text-slate-700 prose prose-slate max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                        {ziyodaCache[currentQuestion.id] ? (
                          <ReactMarkdown>{ziyodaCache[currentQuestion.id]}</ReactMarkdown>
                        ) : (
                          <span className="text-slate-400">…</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {mode === 'practice' ? (
                  <div className="mt-4 flex items-center justify-between gap-4">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={currentIndex === 0}
                      onClick={() => {
                        setWarning(null);
                        setZiyodaError(null);
                        setCurrentIndex((i) => Math.max(0, i - 1));
                      }}
                    >
                      ← {copy.prev}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={currentIndex >= totalQuestions - 1}
                      onClick={() => {
                        setWarning(null);
                        setZiyodaError(null);
                        setCurrentIndex((i) =>
                          Math.min(totalQuestions - 1, i + 1)
                        );
                      }}
                    >
                      {copy.next} →
                    </Button>
                  </div>
                ) : null}
              </Card>
            </motion.div>
          ) : (
            <Card>
              <p className="text-sm text-slate-600">
                {copy.empty}
              </p>
            </Card>
          )}
        </AnimatePresence>

        {warning ? (
          <div
            className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-700"
                aria-hidden
              >
                !
              </span>
              <p className="flex-1 font-medium">{warning}</p>
            </div>
            {mode === 'exam' && warning ? (
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="self-start"
                onClick={() => router.replace('/cabinet')}
              >
                {copy.resetAttempt}
              </Button>
            ) : null}
          </div>
        ) : null}
      </main>

      {/* Кнопка фиксирована над полосой блюра */}
      <div className="fixed bottom-10 left-0 right-0 z-50 mx-auto max-w-3xl px-4">
        <Button
          size="lg"
          className="w-full"
          onClick={handlePrimaryAction}
          disabled={!currentQuestion || isSubmitting}
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden
              />
              {copy.submitting}
            </span>
          ) : (
            copy.finishTest
          )}
        </Button>
      </div>
    </AnimatedPage>
  );
}
