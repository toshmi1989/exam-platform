'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import ErrorState from '../../../../components/ErrorState';
import PageHeader from '../../../../components/PageHeader';
import { getResult, getReview, streamExplainQuestion } from '../../../../lib/api';
import type { ExamResult, ApiError, ExamReview } from '../../../../lib/types';
import { readSettings, Language } from '../../../../lib/uiSettings';
import { readTelegramUser } from '../../../../lib/telegramUser';
import { getOpenInTelegramAppUrl } from '../../../../lib/telegram';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import AiLoadingDots from '../../../../components/AiLoadingDots';

export default function AttemptResultPage() {
  const params = useParams<{ attemptId: string }>();
  const [result, setResult] = useState<ExamResult | null>(null);
  const [review, setReview] = useState<ExamReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<ApiError | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [ziyodaCache, setZiyodaCache] = useState<Record<string, string>>({});
  const [ziyodaLoadingId, setZiyodaLoadingId] = useState<string | null>(null);
  const [ziyodaErrorForId, setZiyodaErrorForId] = useState<string | null>(null);
  const [ziyodaAvatarError, setZiyodaAvatarError] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const user = readTelegramUser();
    setIsGuest(!user?.telegramId || user.telegramId.startsWith('guest-'));
  }, []);

  function localizeReason(reasonCode?: string) {
    if (!reasonCode) return null;
    const common = {
      ATTEMPT_NOT_FOUND: {
        ru: 'Попытка не найдена.',
        uz: 'Urinish topilmadi.',
        en: 'Attempt not found.',
      },
      ATTEMPT_NOT_FINISHED: {
        ru: 'Попытка еще не завершена.',
        uz: 'Urinish hali tugamagan.',
        en: 'Attempt is not finished yet.',
      },
      DETAILS_NOT_AVAILABLE: {
        ru: 'Правильные ответы недоступны.',
        uz: 'To‘g‘ri javoblar mavjud emas.',
        en: 'Correct answers are not available.',
      },
      QUESTIONS_NOT_AVAILABLE: {
        ru: 'Вопросы недоступны.',
        uz: 'Savollar mavjud emas.',
        en: 'Questions are not available.',
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
        errorTitle: 'Unable to load results',
        errorDefault: 'Please try again later.',
        loading: 'Loading results...',
        title: 'Attempt complete',
        subtitle: 'Take a deep breath. Here is your result.',
        score: 'Score',
        passed: 'Passed',
        failed: 'Not passed',
        practiceMode: 'Practice',
        examMode: 'Exam',
        correctAnswers: 'correct answers',
        passingScore: 'Passing score: 28 of 50',
        practiceNote: 'Practice mode — results are not counted',
        review: 'See correct answers',
        reviewTitle: 'Correct answers',
        notAvailable: 'Correct answers are not available for this attempt.',
        notAvailableTitle: 'Answers not available',
        notAvailableMessage:
          'To view correct answers and explanations after the test, you need an active subscription.',
        notAvailableMessageGuest:
          'Answers are available only after you buy one-time access and complete this test, or open in Telegram and get a subscription.',
        subscribeCta: 'Get subscription',
        buyOneTimeCta: 'Buy one-time access',
        openInTelegramCta: 'Open in Telegram',
        reviewError: 'Unable to load review.',
        reviewLoading: 'Loading answers...',
        back: 'Back to exams',
        tryAgain: 'Try again',
        questionLabel: 'Question',
        ziyodaAsk: 'Ask Ziyoda',
        ziyodaThinking: 'Ziyoda is thinking…',
        ziyodaError: 'Could not load explanation.',
      };
    }
    if (language === 'Узбекский') {
      return {
        errorTitle: 'Natijani yuklab bo‘lmadi',
        errorDefault: 'Keyinroq qayta urinib ko‘ring.',
        loading: 'Natijalar yuklanmoqda...',
        title: 'Urinish yakunlandi',
        subtitle: 'Chuqur nafas oling. Bu sizning natijangiz.',
        score: 'Ball',
        passed: 'Test topshirildi',
        failed: 'Test topshirilmadi',
        practiceMode: 'Amaliyot',
        examMode: 'Imtihon',
        correctAnswers: "to'g'ri javob",
        passingScore: "O'tish bali: 28 / 50",
        practiceNote: "Amaliyot rejimi — natija hisobga olinmaydi",
        review: 'To‘g‘ri javoblarni ko‘rish',
        reviewTitle: 'To‘g‘ri javoblar',
        notAvailable: 'Bu urinish uchun to‘g‘ri javoblar mavjud emas.',
        notAvailableTitle: 'Javoblar mavjud emas',
        notAvailableMessage:
          'Testdan keyin to‘g‘ri javoblar va tushuntirishlarni ko‘rish uchun faol obuna kerak.',
        notAvailableMessageGuest:
          'Javoblar faqat shu test uchun bir martalik to‘lov qilib testni tugatgandan keyin yoki Telegramda ochib obuna olgandan keyin ko‘rinadi.',
        subscribeCta: 'Obuna olish',
        buyOneTimeCta: 'Bir martalik kirish',
        openInTelegramCta: "Telegramda ochish",
        reviewError: 'Tekshiruvni yuklab bo‘lmadi.',
        reviewLoading: 'Javoblar yuklanmoqda...',
        back: 'Imtihonlarga qaytish',
        tryAgain: 'Yana urinish',
        questionLabel: 'Savol',
        ziyodaAsk: "Ziyodadan so'rang",
        ziyodaThinking: "Ziyoda o'ylayapti…",
        ziyodaError: 'Tushuntirish yuklanmadi.',
      };
    }
    return {
      errorTitle: 'Не удалось загрузить результаты',
      errorDefault: 'Попробуйте позже.',
      loading: 'Загружаем результаты...',
      title: 'Попытка завершена',
      subtitle: 'Сделайте вдох. Вот ваш результат.',
      score: 'Результат',
      passed: 'Тест сдан',
      failed: 'Тест не сдан',
      practiceMode: 'Учёба',
      examMode: 'Экзамен',
      correctAnswers: 'правильных ответов',
      passingScore: 'Проходной балл: 28 из 50',
      practiceNote: 'Режим учёбы — результат не учитывается',
      review: 'Посмотреть правильные ответы',
      reviewTitle: 'Правильные ответы',
      notAvailable: 'Правильные ответы недоступны для этой попытки.',
      notAvailableTitle: 'Ответы недоступны',
      notAvailableMessage:
        'Чтобы смотреть правильные ответы и пояснения после теста, нужна активная подписка.',
      notAvailableMessageGuest:
        'Ответы доступны только после покупки разового доступа и завершения этого теста или после авторизации в Telegram и оформления подписки.',
      subscribeCta: 'Оформить подписку',
      buyOneTimeCta: 'Купить разовый доступ',
      openInTelegramCta: 'Открыть в Telegram',
      reviewError: 'Не удалось загрузить ответы.',
      reviewLoading: 'Загружаем ответы...',
      back: 'Назад к экзаменам',
      tryAgain: 'Попробовать еще раз',
      questionLabel: 'Вопрос',
      ziyodaAsk: 'Спросить Зиёду',
      ziyodaThinking: 'Зиёда думает…',
      ziyodaError: 'Не удалось загрузить объяснение.',
    };
  }, [language]);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    async function loadResult() {
      try {
        const data = await getResult(params.attemptId);
        setResult(data);
      } catch (err) {
        setError(err as ApiError);
      }
    }

    loadResult();
  }, [params.attemptId]);

  if (error) {
    const localized = localizeReason(error.reasonCode);
    return (
      <ErrorState
        title={copy.errorTitle}
        description={localized ?? error.reasonCode ?? copy.errorDefault}
      />
    );
  }

  if (!result) {
    return <p className="text-sm text-slate-600">{copy.loading}</p>;
  }

  const reviewErrorMessage =
    localizeReason(reviewError?.reasonCode) ?? copy.reviewError;
  const showNotAvailable =
    reviewError?.reasonCode === 'DETAILS_NOT_AVAILABLE' ||
    (review && review.questions.length === 0);

  async function handleReview() {
    if (reviewLoading || review) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const data = await getReview(params.attemptId);
      setReview(data);
    } catch (err) {
      setReviewError(err as ApiError);
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleZiyodaClick(questionId: string) {
    if (ziyodaCache[questionId]?.length || ziyodaLoadingId) return;
    setZiyodaLoadingId(questionId);
    setZiyodaErrorForId(null);
    setZiyodaCache((prev) => ({ ...prev, [questionId]: '' }));
    try {
      await streamExplainQuestion(
        questionId,
        (content) => setZiyodaCache((prev) => ({ ...prev, [questionId]: (prev[questionId] ?? '') + content })),
        () => setZiyodaLoadingId(null)
      );
    } catch {
      setZiyodaErrorForId(questionId);
      setZiyodaLoadingId(null);
    }
  }

  const showReviewUI = review && review.questions.length > 0;
  const isPractice = result.mode === 'practice';
  const showReviewButton = !isPractice;

  const PASS_THRESHOLD = 28;
  const isPassed = result.score >= PASS_THRESHOLD;
  const scorePercent = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;

  // #region agent log
  if (showReviewUI && review) {
    const sample = review.questions.slice(0, 5).map((q, i) => {
      const selected = review.answers?.[q.id];
      const hasAnswer = selected != null && selected !== '';
      const isCorrect = hasAnswer && q.correctOptionId != null && selected === q.correctOptionId;
      const isWrong = hasAnswer && q.correctOptionId !== selected;
      const unanswered = !hasAnswer;
      return { i: i + 1, qId: q.id, selected, correctId: q.correctOptionId, hasAnswer, isCorrect, isWrong, unanswered, selectedType: typeof selected, correctType: typeof q.correctOptionId };
    });
    const unansweredIndices = review.questions
      .map((q, i) => ({ i: i + 1, selected: review.answers?.[q.id], correctId: q.correctOptionId }))
      .filter((_, idx) => {
        const q = review.questions[idx];
        const sel = review.answers?.[q.id];
        return (sel == null || sel === '') && q.correctOptionId != null;
      });
    fetch('http://127.0.0.1:7242/ingest/4fc32459-9fe7-40db-9541-c82348e3184a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'result/page.tsx:review-cards', message: 'review card coloring', data: { sample, unansweredIndices, answerKeys: review.answers ? Object.keys(review.answers).slice(0, 10) : [], questionIds: review.questions.slice(0, 5).map(q => q.id) }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H1-H3' }) }).catch(() => {});
  }
  // #endregion

  return (
    <>
    <main className="flex min-h-screen flex-col gap-6 pb-8 pt-[3.75rem]">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      {/* Score card */}
      <div className={`rounded-2xl border-2 p-5 ${isPassed ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
        {/* Mode badge */}
        <div className="mb-3 flex items-center justify-between">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isPractice ? 'bg-slate-100 text-slate-600' : 'bg-white/70 text-slate-600'}`}>
            {isPractice ? copy.practiceMode : copy.examMode}
          </span>
          {!isPractice && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${isPassed ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
              {isPassed ? '✓' : '✗'} {isPassed ? copy.passed : copy.failed}
            </span>
          )}
        </div>

        {/* Big score */}
        <div className="flex items-end justify-center gap-1 py-2">
          <span className={`text-6xl font-extrabold leading-none ${isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
            {result.score}
          </span>
          <span className="mb-1 text-2xl font-semibold text-slate-400">
            / {result.maxScore}
          </span>
        </div>

        <p className={`mt-1 text-center text-sm font-medium ${isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
          {result.score} {copy.correctAnswers} — {scorePercent}%
        </p>

        {/* Progress bar */}
        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/60">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isPassed ? 'bg-emerald-500' : 'bg-rose-400'}`}
            style={{ width: `${scorePercent}%` }}
          />
        </div>

        {/* Passing score hint */}
        {!isPractice ? (
          <p className="mt-3 text-center text-xs text-slate-500">{copy.passingScore}</p>
        ) : (
          <p className="mt-3 text-center text-xs text-slate-500">{copy.practiceNote}</p>
        )}
      </div>

      {showReviewUI ? (
        <>
          <div className="flex flex-wrap gap-2">
            {review.questions.map((question, index) => {
              const selected = review.answers?.[question.id];
              const hasAnswer = selected != null && selected !== '';
              const isCorrect =
                hasAnswer &&
                question.correctOptionId != null &&
                selected === question.correctOptionId;
              const isWrong =
                hasAnswer && question.correctOptionId !== selected;
              const unanswered = !hasAnswer;
              const active = index === reviewIndex;
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setReviewIndex(index)}
                  className={`flex min-w-[2.5rem] items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white ring-2 ring-slate-400'
                      : isCorrect
                        ? 'border-emerald-400 bg-emerald-100 text-emerald-800 hover:opacity-90'
                        : isWrong || unanswered
                          ? 'border-rose-400 bg-rose-100 text-rose-800 hover:opacity-90'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {review.questions[reviewIndex] ? (
              <motion.div
                key={review.questions[reviewIndex].id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="mt-6"
              >
                <Card
                  title={`${copy.questionLabel} ${reviewIndex + 1} / ${review.questions.length}`}
                >
                  <p className="text-sm text-slate-700">
                    {review.questions[reviewIndex].text}
                  </p>
                  {review.questions[reviewIndex].options ? (
                    <div className="mt-4 flex flex-col gap-2">
                      {review.questions[reviewIndex].options!.map((option) => {
                        const isCorrect =
                          review.questions[reviewIndex].correctOptionId === option.id;
                        const isWrong =
                          review.answers?.[review.questions[reviewIndex].id] ===
                            option.id && !isCorrect;
                        return (
                          <div
                            key={option.id}
                            className={`rounded-xl border px-4 py-3 text-left text-sm ${
                              isCorrect
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : isWrong
                                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                                  : 'border-slate-200 text-slate-700'
                            }`}
                          >
                            {option.text}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      disabled={ziyodaLoadingId === review.questions[reviewIndex].id}
                      onClick={() => handleZiyodaClick(review.questions[reviewIndex].id)}
                    >
                      🧠 {copy.ziyodaAsk}
                    </Button>
                    {ziyodaLoadingId === review.questions[reviewIndex].id && (
                      <div className="mt-2">
                        <AiLoadingDots text={copy.ziyodaThinking} />
                      </div>
                    )}
                    {ziyodaErrorForId === review.questions[reviewIndex].id && (
                      <p className="mt-2 text-sm text-rose-600">{copy.ziyodaError}</p>
                    )}
                    {(ziyodaCache[review.questions[reviewIndex].id] !== undefined || ziyodaLoadingId === review.questions[reviewIndex].id) && (
                      <div className="mt-3 flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#2AABEE] flex items-center justify-center text-white font-semibold text-base">
                            {ziyodaAvatarError ? (
                              <span aria-hidden="true">З</span>
                            ) : (
                              <img
                                src="/ziyoda-avatar.png"
                                alt=""
                                className="h-full w-full object-cover"
                                onError={() => setZiyodaAvatarError(true)}
                              />
                            )}
                          </div>
                          <span className="text-sm font-medium text-slate-700">Зиёда объясняет</span>
                        </div>
                        <div className="w-full min-w-0 text-sm text-slate-700 prose prose-slate max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-headings:font-medium">
                          {ziyodaCache[review.questions[reviewIndex].id] ? (
                            <ReactMarkdown>{ziyodaCache[review.questions[reviewIndex].id]}</ReactMarkdown>
                          ) : (
                            <span className="text-slate-400">…</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          {showReviewButton ? (
            <>
              <Button size="lg" onClick={handleReview} disabled={reviewLoading}>
                {copy.review}
              </Button>
              {reviewLoading ? (
                <p className="text-xs text-slate-500">{copy.reviewLoading}</p>
              ) : null}
              {reviewError && !showNotAvailable ? (
                <Card>
                  <p className="text-sm text-rose-500">{reviewErrorMessage}</p>
                </Card>
              ) : null}
              {showNotAvailable ? (
                <div
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm"
                  role="alert"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600"
                      aria-hidden
                    >
                      ℹ
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {copy.notAvailableTitle}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {isGuest ? copy.notAvailableMessageGuest : copy.notAvailableMessage}
                      </p>
                      {isGuest ? (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          {result.examId ? (
                            <Button
                              href={`/cabinet/pay-one-time?examId=${encodeURIComponent(result.examId)}&mode=exam`}
                              size="md"
                              className="w-full sm:w-auto"
                            >
                              {copy.buyOneTimeCta}
                            </Button>
                          ) : null}
                          <Button
                            href={getOpenInTelegramAppUrl()}
                            size="md"
                            variant="secondary"
                            className="w-full sm:w-auto"
                          >
                            {copy.openInTelegramCta}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          href="/cabinet/subscribe"
                          size="md"
                          className="mt-3 w-full sm:w-auto"
                        >
                          {copy.subscribeCta}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          <Button href="/exam/select" size="lg" className="w-full">
            {copy.tryAgain}
          </Button>
        </div>
      )}

      {showReviewUI ? (
        <div className="pt-4">
          <Button href="/exam/select" size="lg" className="w-full">
            {copy.tryAgain}
          </Button>
        </div>
      ) : null}
    </main>
  </>
  );
}
