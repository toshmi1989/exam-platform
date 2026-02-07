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
        review: 'See correct answers',
        reviewTitle: 'Correct answers',
        notAvailable: 'Correct answers are not available for this attempt.',
        notAvailableTitle: 'Answers not available',
        notAvailableMessage:
          'To view correct answers and explanations after the test, you need an active subscription.',
        subscribeCta: 'Get subscription',
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
        review: 'To‘g‘ri javoblarni ko‘rish',
        reviewTitle: 'To‘g‘ri javoblar',
        notAvailable: 'Bu urinish uchun to‘g‘ri javoblar mavjud emas.',
        notAvailableTitle: 'Javoblar mavjud emas',
        notAvailableMessage:
          'Testdan keyin to‘g‘ri javoblar va tushuntirishlarni ko‘rish uchun faol obuna kerak.',
        subscribeCta: 'Obuna olish',
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
      review: 'Посмотреть правильные ответы',
      reviewTitle: 'Правильные ответы',
      notAvailable: 'Правильные ответы недоступны для этой попытки.',
      notAvailableTitle: 'Ответы недоступны',
      notAvailableMessage:
        'Чтобы смотреть правильные ответы и пояснения после теста, нужна активная подписка.',
      subscribeCta: 'Оформить подписку',
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

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span className="font-semibold text-slate-900">
          {copy.score}: {result.score} / {result.maxScore}
        </span>
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
                      <div className="mt-3 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <img
                          src="/ziyoda-avatar.png"
                          alt="Зиёда"
                          className="h-12 w-12 shrink-0 rounded-full object-cover"
                        />
                        <div className="min-w-0 flex-1 text-sm text-slate-700 prose prose-slate max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
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
                        {copy.notAvailableMessage}
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
