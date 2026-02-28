'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import React from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import AnimatedPage from '../../../../components/AnimatedPage';
import BottomNav from '../../../../components/BottomNav';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import PageHeader from '../../../../components/PageHeader';
import { readSettings, Language } from '../../../../lib/uiSettings';
import { getOralQuestions, streamOralAnswer } from '../../../../lib/api';
import { apiFetch } from '../../../../lib/api/client';
import { API_BASE_URL } from '../../../../lib/api/config';
import { readTelegramUser } from '../../../../lib/telegramUser';
import { getOpenInTelegramAppUrl } from '../../../../lib/telegram';
import ReactMarkdown from 'react-markdown';
import AiLoadingDots from '../../../../components/AiLoadingDots';
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
  const [accessDenied, setAccessDenied] = useState(false);
  const [index, setIndex] = useState(0);
  const lastIndexRestored = useRef(false);
  const [answerCache, setAnswerCache] = useState<Record<string, string>>({});
  const [loadingAnswerId, setLoadingAnswerId] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [answerLimitReached, setAnswerLimitReached] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [audioUrl, setAudioUrl] = useState<Record<string, string>>({});
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [answerVisible, setAnswerVisible] = useState<Record<string, boolean>>({});
  const [goToInput, setGoToInput] = useState('');

  const orderedQuestions = useMemo(() => {
    if (orderMode === 'random' && questions.length > 0) {
      return shuffle(questions);
    }
    return [...questions].sort((a, b) => a.order - b.order);
  }, [questions, orderMode]);

  const current = orderedQuestions[index] ?? null;
  const total = orderedQuestions.length;

  useEffect(() => {
    const user = readTelegramUser();
    const isGuestUser = !user?.telegramId || user.telegramId.startsWith('guest-');
    setIsGuest(isGuestUser);
  }, []);

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
    setAccessDenied(false);
    lastIndexRestored.current = false;
    getOralQuestions(examId)
      .then(setQuestions)
      .catch((err: { reasonCode?: string }) => {
        if (err?.reasonCode === 'ACCESS_DENIED') {
          setAccessDenied(true);
        } else {
          setError('Failed to load questions');
        }
      })
      .finally(() => setLoading(false));
  }, [examId]);

  // В режиме «по очереди» восстанавливаем последний просмотренный вопрос при загрузке
  useEffect(() => {
    if (orderMode !== 'order' || !examId || orderedQuestions.length === 0 || lastIndexRestored.current) return;
    lastIndexRestored.current = true;
    try {
      const key = `ziyomed:oral-prep:${examId}`;
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        const n = parseInt(saved, 10);
        if (Number.isFinite(n) && n >= 0 && n < orderedQuestions.length) {
          setIndex(n);
        }
      }
    } catch {
      // ignore
    }
  }, [examId, orderMode, orderedQuestions.length]);

  // В режиме «по очереди» сохраняем индекс при переключении вопроса
  useEffect(() => {
    if (orderMode !== 'order' || !examId) return;
    try {
      localStorage.setItem(`ziyomed:oral-prep:${examId}`, String(index));
    } catch {
      // ignore
    }
  }, [orderMode, examId, index]);

  useEffect(() => {
    setGoToInput(String(index + 1));
  }, [index]);

  const showAnswer = useCallback(async (questionId: string) => {
    if (answerCache[questionId]?.length) return;
    if (loadingAnswerId === questionId) return;
    setLoadingAnswerId(questionId);
    setAnswerError(null);
    setAnswerLimitReached(false);
    if (answerCache[questionId] === undefined) {
      setAnswerCache((prev) => ({ ...prev, [questionId]: '' }));
    }
    try {
      await streamOralAnswer(
        questionId,
        (content) => {
          setAnswerCache((prev) => ({ ...prev, [questionId]: (prev[questionId] ?? '') + content }));
        },
        () => setLoadingAnswerId(null)
      );
    } catch (err: unknown) {
      const apiErr = err as { reasonCode?: string };
      if (apiErr?.reasonCode === 'ACCESS_DENIED') {
        setAnswerLimitReached(true);
      } else {
        setAnswerError(
          language === 'Узбекский'
            ? "Javobni yuklab bo'lmadi."
            : language === 'Английский'
              ? 'Failed to load answer.'
              : 'Не удалось загрузить ответ.'
        );
      }
      setLoadingAnswerId(null);
    }
  }, [language]);

  // Stop audio function
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingAudioId(null);
  }, []);

  const playAudio = useCallback(async (questionId: string) => {
    // If audio is already playing for this question, stop it
    if (playingAudioId === questionId) {
      stopAudio();
      return;
    }

    // Stop any currently playing audio
    stopAudio();

    // If audio already exists, play it
    if (audioUrl[questionId]) {
      const audio = new Audio(audioUrl[questionId]);
      audioRef.current = audio;
      setPlayingAudioId(questionId);
      
      audio.addEventListener('ended', () => {
        setPlayingAudioId(null);
        audioRef.current = null;
      });
      
      audio.addEventListener('error', () => {
        setAudioError('Failed to play audio');
        setPlayingAudioId(null);
        audioRef.current = null;
      });
      
      audio.play().catch(() => {
        setAudioError('Failed to play audio');
        setPlayingAudioId(null);
        audioRef.current = null;
      });
      return;
    }

    // Generate audio
    if (loadingAudioId === questionId) return;
    setLoadingAudioId(questionId);
    setAudioError(null);

    try {
      const lang = language === 'Узбекский' ? 'uz' : 'ru';
      const { response, data } = await apiFetch('/tts/speak', {
        method: 'POST',
        json: { questionId, lang },
        timeoutMs: 60000,
      });

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const result = data as { ok?: boolean; audioUrl?: string };
      if (result.ok && result.audioUrl) {
        // Prepend API base URL if audioUrl is relative
        const fullUrl = result.audioUrl.startsWith('http') ? result.audioUrl : `${API_BASE_URL}${result.audioUrl}`;
        setAudioUrl((prev) => ({ ...prev, [questionId]: fullUrl }));
        
        const audio = new Audio(fullUrl);
        audioRef.current = audio;
        setPlayingAudioId(questionId);
        
        audio.addEventListener('ended', () => {
          setPlayingAudioId(null);
          audioRef.current = null;
        });
        
        audio.addEventListener('error', () => {
          setAudioError('Failed to play audio');
          setPlayingAudioId(null);
          audioRef.current = null;
        });
        
        audio.play().catch(() => {
          setAudioError('Failed to play audio');
          setPlayingAudioId(null);
          audioRef.current = null;
        });
      } else {
        throw new Error('Invalid response');
      }
    } catch (err) {
      setAudioError(
        language === 'Узбекский'
          ? "Audio yuklab bo'lmadi."
          : language === 'Английский'
            ? 'Failed to load audio.'
            : 'Не удалось загрузить аудио.'
      );
    } finally {
      setLoadingAudioId(null);
    }
  }, [language, audioUrl, loadingAudioId, playingAudioId, stopAudio]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Oral exam',
        subtitle: 'Study questions and reveal answers.',
        showAnswer: 'Show answer',
        hideAnswer: 'Hide answer',
        playAudio: 'Ziyoda explain!',
        stopAudio: 'Ziyoda stop!',
        preparing: 'Ziyoda is preparing...',
        loading: 'Loading...',
        loadingSearch: 'Ziyoda is searching for the answer…',
        loadingAudio: 'Generating audio...',
        prev: 'Previous',
        next: 'Next',
        questionNum: (n: number, t: number) => `Question ${n} of ${t}`,
        goToQuestion: 'Go to question',
        goToOf: 'of',
        close: 'Close',
        finish: 'Finish',
        openInRussian: 'Open in Russian',
        answerHeader: 'Ziyoda answers',
        dailyLimitTitle: 'Daily limit used',
        dailyLimitHint: 'Your free attempts for today are used. Get a subscription to continue.',
        buySubscriptionCta: 'Get subscription',
        guestOralLimitHint: 'Limit exhausted. To continue, make a one-time payment for 1 session or buy a subscription in your Telegram account!',
        openInTelegramCta: 'Go to Telegram',
        takeExam: 'Take oral exam',
        takeExamHint: 'Subscribers only · 1 time per day',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: "Og'zaki imtihon",
        subtitle: "Savollarni o'rganing va javoblarni ko'ring.",
        showAnswer: "Javobni ko'rsatish",
        hideAnswer: "Javobni yashirish",
        playAudio: "Ziyoda tushuntir!",
        stopAudio: "Ziyoda to'xtat!",
        preparing: "Ziyoda tayyorlanmoqda...",
        loading: 'Yuklanmoqda...',
        loadingSearch: "Ziyoda javob qidirmoqda…",
        loadingAudio: "Audio yaratilmoqda...",
        prev: 'Oldingi',
        next: 'Keyingi',
        questionNum: (n: number, t: number) => `${n} / ${t} savol`,
        goToQuestion: "Savolga o'tish",
        goToOf: '/',
        close: 'Yopish',
        finish: 'Tugatish',
        openInRussian: "Ruscha ochish",
        answerHeader: 'Ziyoda javob beradi',
        dailyLimitTitle: 'Kunlik limit tugadi',
        dailyLimitHint: 'Bepul urinishlar bugun tugadi. Davom etish uchun obuna oling.',
        buySubscriptionCta: 'Obuna olish',
        guestOralLimitHint: "Limit tugadi. Davom etish uchun 1 seans uchun bir martalik to'lov qiling yoki Telegramdagi shaxsiy kabinetingizda obuna oling!",
        openInTelegramCta: "Telegramga o'tish",
        takeExam: "Og'zaki imtihon topshirish",
        takeExamHint: "Faqat obuna uchun · Kuniga 1 marta",
      };
    }
    return {
      title: 'Устный экзамен',
      subtitle: 'Изучайте вопросы и открывайте ответы.',
        showAnswer: 'Показать ответ',
        hideAnswer: 'Скрыть ответ',
        playAudio: 'Зиёда объясни!',
        stopAudio: 'Зиёда хватит!',
        preparing: 'Зиёда готовится...',
        loading: 'Загрузка...',
        loadingSearch: 'Зиёда ищет ответ…',
        loadingAudio: 'Генерация аудио...',
      prev: 'Назад',
      next: 'Далее',
      questionNum: (n: number, t: number) => `Вопрос ${n} из ${t}`,
      goToQuestion: 'К вопросу',
      goToOf: 'из',
      close: 'Закрыть',
      finish: 'Завершить',
      openInRussian: 'Открыть на русском',
      answerHeader: 'Зиёда отвечает',
      dailyLimitTitle: 'Дневной лимит исчерпан',
      dailyLimitHint: 'Бесплатные попытки на сегодня израсходованы. Для продолжения нужна подписка.',
      buySubscriptionCta: 'Купить подписку',
      guestOralLimitHint: 'Лимит закончился. Для продолжения совершите разовый платёж для 1 сеанса или купите подписку в личном кабинете с Telegram!',
      openInTelegramCta: 'Перейти в Telegram',
      takeExam: 'Сдать устный экзамен',
      takeExamHint: 'Только для подписчиков · 1 раз в сутки',
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

  if (accessDenied) {
    const guestHint = (copy as { guestOralLimitHint?: string }).guestOralLimitHint;
    const openInTelegramCta = (copy as { openInTelegramCta?: string }).openInTelegramCta;
    return (
      <AnimatedPage>
        <main className="flex min-h-[50vh] flex-col gap-4 pb-28 pt-[3.75rem]">
          <PageHeader title={copy.title} subtitle={copy.subtitle} />
          <Card>
            <div className="flex flex-col gap-3">
              <p className="font-semibold text-amber-800">{copy.dailyLimitTitle}</p>
              <p className="text-sm text-slate-600">
                {isGuest ? (guestHint ?? 'Чтобы продолжить, откройте ZiyoMed в Telegram и оформите подписку.') : copy.dailyLimitHint}
              </p>
              <div className="mt-2">
                {isGuest ? (
                  <a
                    href={getOpenInTelegramAppUrl()}
                    className="inline-flex w-full justify-center rounded-xl bg-[#2AABEE] px-5 py-3 text-base font-semibold text-white hover:bg-[#229ED9]"
                  >
                    {openInTelegramCta ?? 'Открыть в Telegram'}
                  </a>
                ) : (
                  <Button href="/cabinet/subscribe" size="lg">
                    {copy.buySubscriptionCta}
                  </Button>
                )}
              </div>
            </div>
          </Card>
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
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  const visible = answerVisible[current.id];
                  if (visible) {
                    setAnswerVisible((prev) => ({ ...prev, [current.id]: false }));
                  } else {
                    setAnswerVisible((prev) => ({ ...prev, [current.id]: true }));
                    if (answerCache[current.id] === undefined && loadingAnswerId !== current.id) {
                      showAnswer(current.id);
                    }
                  }
                }}
                disabled={loadingAnswerId === current.id}
              >
                {answerVisible[current.id] ? (copy as { hideAnswer?: string }).hideAnswer ?? 'Скрыть ответ' : copy.showAnswer}
              </Button>
              {answerVisible[current.id] && answerCache[current.id] && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => playAudio(current.id)}
                    disabled={loadingAudioId === current.id}
                  >
                    {playingAudioId === current.id ? (
                      <>🛑 {copy.stopAudio}</>
                    ) : loadingAudioId === current.id ? (
                      <>🤖 {copy.preparing}</>
                    ) : (
                      <>🤖 {copy.playAudio}</>
                    )}
                  </Button>
                  {loadingAudioId === current.id && (
                    <div className="mt-2">
                      <AiLoadingDots text={copy.preparing} />
                    </div>
                  )}
                </>
              )}
            </div>
            {audioError && (
              <p className="mt-2 text-sm text-rose-600">{audioError}</p>
            )}
            {loadingAnswerId === current.id && (
              <div className="mt-3">
                <AiLoadingDots text={copy.loadingSearch} />
              </div>
            )}
            {answerError && (
              <p className="mt-2 text-sm text-rose-600">{answerError}</p>
            )}
            {answerLimitReached && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="font-semibold text-amber-800">{copy.dailyLimitTitle}</p>
                <p className="mt-0.5 text-sm text-amber-800">
                  {isGuest
                    ? ((copy as { guestOralLimitHint?: string }).guestOralLimitHint ?? 'Чтобы продолжить, откройте ZiyoMed в Telegram и оформите подписку.')
                    : copy.dailyLimitHint}
                </p>
                {isGuest ? (
                  <a
                    href={getOpenInTelegramAppUrl()}
                    className="mt-3 inline-flex w-full justify-center rounded-xl bg-[#2AABEE] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#229ED9]"
                  >
                    {(copy as { openInTelegramCta?: string }).openInTelegramCta ?? 'Открыть в Telegram'}
                  </a>
                ) : (
                  <Button href="/cabinet/subscribe" size="md" className="mt-3">
                    {copy.buySubscriptionCta}
                  </Button>
                )}
              </div>
            )}
            {(answerVisible[current.id] && (answerCache[current.id] !== undefined || loadingAnswerId === current.id)) && (
              <div className="mt-4 overflow-hidden rounded-xl border-2 border-[#2AABEE]/20 bg-gradient-to-b from-slate-50 to-white shadow-sm">
                <div className="border-b border-slate-200 bg-[#2AABEE]/10 px-4 py-2.5">
                  <p className="text-sm font-semibold text-slate-800">
                    🤖 {copy.answerHeader}
                  </p>
                </div>
                <div className="p-4 text-sm prose prose-slate max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-blockquote:border-[#2AABEE] prose-blockquote:bg-slate-50/80 prose-blockquote:rounded-r prose-img:rounded-lg prose-img:shadow-md">
                  <div className="overflow-x-auto">
                    {answerCache[current.id] ? (
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
                    ) : (
                      <span className="text-slate-400">…</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {orderMode === 'order' && total > 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2">
              <span className="text-sm font-medium text-slate-600">
                {(copy as { goToQuestion?: string }).goToQuestion ?? 'К вопросу'}
              </span>
              <input
                type="number"
                min={1}
                max={total}
                value={goToInput}
                placeholder={String(index + 1)}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  if (raw === '') {
                    setGoToInput('');
                    return;
                  }
                  const n = parseInt(raw, 10);
                  if (Number.isFinite(n)) {
                    const clamped = Math.min(total, Math.max(1, n));
                    setGoToInput(String(clamped));
                  }
                }}
                onBlur={() => {
                  if (goToInput.trim() === '') {
                    setGoToInput(String(index + 1));
                    return;
                  }
                  const n = parseInt(goToInput, 10);
                  if (Number.isFinite(n) && n >= 1 && n <= total) {
                    stopAudio();
                    setIndex(n - 1);
                  } else {
                    setGoToInput(String(index + 1));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (goToInput.trim() === '') {
                      setGoToInput(String(index + 1));
                      (e.target as HTMLInputElement).blur();
                      return;
                    }
                    const n = parseInt(goToInput, 10);
                    if (Number.isFinite(n) && n >= 1 && n <= total) {
                      stopAudio();
                      setIndex(n - 1);
                    } else {
                      setGoToInput(String(index + 1));
                    }
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm tabular-nums text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                aria-label={`${(copy as { goToQuestion?: string }).goToQuestion ?? 'К вопросу'} 1 ${(copy as { goToOf?: string }).goToOf ?? 'из'} ${total}`}
              />
              <span className="text-sm text-slate-500 tabular-nums">
                {(copy as { goToOf?: string }).goToOf ?? 'из'} {total}
              </span>
            </div>
          )}

          <div className="flex flex-col items-center gap-4">
            <div className="flex justify-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  stopAudio();
                  setIndex((i) => Math.max(0, i - 1));
                }}
                disabled={index === 0}
              >
                {copy.prev}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  stopAudio();
                  setIndex((i) => Math.min(total - 1, i + 1));
                }}
                disabled={index >= total - 1}
              >
                {copy.next}
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                stopAudio();
                router.push('/exam/select');
              }}
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
