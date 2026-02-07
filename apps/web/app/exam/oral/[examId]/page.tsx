'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import AnimatedPage from '../../../../components/AnimatedPage';
import BottomNav from '../../../../components/BottomNav';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import PageHeader from '../../../../components/PageHeader';
import { readSettings, Language } from '../../../../lib/uiSettings';
import { getOralQuestions, getOralAnswer } from '../../../../lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface QuestionItem {
  id: string;
  prompt: string;
  order: number;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const ALLOWED_IFRAME_HOSTS = ['ru.wikipedia.org', 'uz.wikipedia.org', 'en.wikipedia.org', 'wikipedia.org'];

function SafeLink({ href, children, onLinkClick }: { href?: string; children: React.ReactNode; onLinkClick?: (url: string) => void }) {
  const url = href ?? '';
  const isAllowed = ALLOWED_IFRAME_HOSTS.some((h) => url.includes(h));
  if (isAllowed && onLinkClick) {
    return (
      <button
        type="button"
        className="text-[#2AABEE] underline focus:outline-none focus:ring-2 focus:ring-[#2AABEE]/50 rounded px-0.5"
        onClick={() => onLinkClick(url)}
      >
        {children}
      </button>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#2AABEE] underline">
      {children}
    </a>
  );
}

export default function OralExamPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const examId = typeof params?.examId === 'string' ? params.examId : '';
  const orderMode = searchParams.get('order') === 'random' ? 'random' : 'order';

  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answerCache, setAnswerCache] = useState<Record<string, string>>({});
  const [loadingAnswerId, setLoadingAnswerId] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  const orderedQuestions = useMemo(() => {
    if (orderMode === 'random' && questions.length > 0) {
      return shuffle(questions);
    }
    return [...questions].sort((a, b) => a.order - b.order);
  }, [questions, orderMode]);

  const current = orderedQuestions[index] ?? null;
  const total = orderedQuestions.length;

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    if (!examId) {
      setLoading(false);
      setError('Exam not found');
      return;
    }
    setLoading(true);
    setError(null);
    getOralQuestions(examId)
      .then(setQuestions)
      .catch(() => setError('Failed to load questions'))
      .finally(() => setLoading(false));
  }, [examId]);

  const showAnswer = useCallback(async (questionId: string) => {
    if (answerCache[questionId]) return;
    setLoadingAnswerId(questionId);
    setAnswerError(null);
    try {
      const { content } = await getOralAnswer(questionId);
      setAnswerCache((prev) => ({ ...prev, [questionId]: content }));
    } catch {
      setAnswerError(
        language === 'Узбекский'
          ? "Javobni yuklab bo'lmadi."
          : language === 'Английский'
            ? 'Failed to load answer.'
            : 'Не удалось загрузить ответ.'
      );
    } finally {
      setLoadingAnswerId(null);
    }
  }, [answerCache, language]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Oral exam',
        subtitle: 'Study questions and reveal answers.',
        showAnswer: 'Show answer',
        loading: 'Loading...',
        prev: 'Previous',
        next: 'Next',
        questionNum: (n: number, t: number) => `Question ${n} of ${t}`,
        close: 'Close',
        finish: 'Finish',
        openInRussian: 'Open in Russian',
        answerHeader: 'Ziyoda answers',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: "Og'zaki imtihon",
        subtitle: "Savollarni o'rganing va javoblarni ko'ring.",
        showAnswer: "Javobni ko'rsatish",
        loading: 'Yuklanmoqda...',
        prev: 'Oldingi',
        next: 'Keyingi',
        questionNum: (n: number, t: number) => `${n} / ${t} savol`,
        close: 'Yopish',
        finish: 'Tugatish',
        openInRussian: "Ruscha ochish",
        answerHeader: 'Ziyoda javob beradi',
      };
    }
    return {
      title: 'Устный экзамен',
      subtitle: 'Изучайте вопросы и открывайте ответы.',
      showAnswer: 'Показать ответ',
      loading: 'Загрузка...',
      prev: 'Назад',
      next: 'Далее',
      questionNum: (n: number, t: number) => `Вопрос ${n} из ${t}`,
      close: 'Закрыть',
      finish: 'Завершить',
      openInRussian: 'Открыть на русском',
      answerHeader: 'Зиёда отвечает',
    };
  }, [language]);

  if (loading) {
    return (
      <AnimatedPage>
        <main className="flex min-h-[50vh] items-center justify-center pb-28 pt-[3.75rem]">
          <p className="text-slate-600">{copy.loading}</p>
        </main>
        <BottomNav />
      </AnimatedPage>
    );
  }

  if (error || total === 0) {
    return (
      <AnimatedPage>
        <main className="flex min-h-[50vh] flex-col gap-4 pb-28 pt-[3.75rem]">
          <PageHeader title={copy.title} subtitle={copy.subtitle} />
          <Card>
            <p className="text-slate-600">{error ?? (total === 0 ? 'No questions' : '')}</p>
          </Card>
        </main>
        <BottomNav />
      </AnimatedPage>
    );
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex min-h-[70vh] flex-col gap-6 pb-28 pt-[3.75rem]">
          <PageHeader
            title={copy.title}
            subtitle={`${copy.questionNum(index + 1, total)}`}
          />

          <Card>
            <p className="whitespace-pre-wrap text-slate-800">{current.prompt}</p>
            <div className="mt-4">
              <Button
                type="button"
                onClick={() => showAnswer(current.id)}
                disabled={loadingAnswerId === current.id}
              >
                {loadingAnswerId === current.id ? copy.loading : copy.showAnswer}
              </Button>
            </div>
            {answerError && (
              <p className="mt-2 text-sm text-rose-600">{answerError}</p>
            )}
            {answerCache[current.id] && (
              <div className="mt-4 overflow-hidden rounded-xl border-2 border-[#2AABEE]/20 bg-gradient-to-b from-slate-50 to-white shadow-sm">
                <div className="border-b border-slate-200 bg-[#2AABEE]/10 px-4 py-2.5">
                  <p className="text-sm font-semibold text-slate-800">
                    🤖 {copy.answerHeader}
                  </p>
                </div>
                <div className="p-4 text-sm prose prose-slate max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-blockquote:border-[#2AABEE] prose-blockquote:bg-slate-50/80 prose-blockquote:py-1 prose-blockquote:rounded-r prose-img:rounded-lg prose-img:shadow-md">
                  <div className="overflow-x-auto">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h2: ({ children }) => (
                          <h2 className="mt-4 mb-2 text-base font-semibold text-slate-800 border-l-4 border-[#2AABEE] pl-3 first:mt-0">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="mt-3 mb-1 text-sm font-semibold text-slate-700">
                            {children}
                          </h3>
                        ),
                        a: ({ href, children }) => (
                          <SafeLink href={href} onLinkClick={(url) => setIframeUrl(url)}>
                            {children}
                          </SafeLink>
                        ),
                        img: ({ src, alt }) => {
                          const srcStr = typeof src === 'string' ? src : undefined;
                          if (!srcStr) return null;
                          return (
                            <a href={srcStr} target="_blank" rel="noopener noreferrer" className="block my-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={srcStr} alt={alt ?? ''} className="max-h-64 w-auto rounded-lg object-contain shadow-md border border-slate-200" />
                            </a>
                          );
                        },
                        table: ({ children }) => (
                          <div className="my-4 overflow-x-auto rounded-lg border border-slate-200">
                            <table className="min-w-full text-sm border-collapse">
                              {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-[#2AABEE]/15 text-slate-800 font-semibold">
                            {children}
                          </thead>
                        ),
                        tbody: ({ children }) => (
                          <tbody className="[&>tr:nth-child(even)]:bg-slate-50/80">
                            {children}
                          </tbody>
                        ),
                        tr: ({ children }) => (
                          <tr className="border-b border-slate-100 last:border-0">
                            {children}
                          </tr>
                        ),
                        th: ({ children }) => (
                          <th className="px-3 py-2 text-left">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="px-3 py-2">
                            {children}
                          </td>
                        ),
                      }}
                    >
                      {answerCache[current.id]}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <div className="flex flex-col items-center gap-4">
            <div className="flex justify-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                {copy.prev}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                disabled={index >= total - 1}
              >
                {copy.next}
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push('/exam/select')}
            >
              {copy.finish}
            </Button>
          </div>
        </main>
      </AnimatedPage>

      {iframeUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-2">
              <div className="flex gap-2">
                {iframeUrl.includes('uz.wikipedia.org') && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => setIframeUrl(iframeUrl.replace('uz.wikipedia.org', 'ru.wikipedia.org'))}
                  >
                    {copy.openInRussian}
                  </Button>
                )}
              </div>
              <Button type="button" variant="secondary" size="md" onClick={() => setIframeUrl(null)}>
                {copy.close}
              </Button>
            </div>
            <iframe
              title="Term definition"
              src={iframeUrl}
              className="flex-1 w-full rounded-b-2xl border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}

      <BottomNav />
    </>
  );
}
