'use client';

import { Suspense } from 'react';
import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../components/AnimatedPage';
import BottomNav from '../../components/BottomNav';
import Button from '../../components/Button';
import Card from '../../components/Card';
import PageHeader from '../../components/PageHeader';
import { useRouter } from 'next/navigation';
import { readTelegramUser, storeTelegramUser, TelegramUserSnapshot } from '../../lib/telegramUser';
import { readSettings, Language } from '../../lib/uiSettings';
import { getProfile, getChatUnread, getBroadcasts, dismissBroadcast as dismissBroadcastApi, type BroadcastItem } from '../../lib/api';
import { getQuoteByIndex, CABINET_QUOTES } from '../../data/cabinetQuotes';

export const dynamic = 'force-dynamic';

function CabinetClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<TelegramUserSnapshot | null>(null);
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([]);
  const [dismissedBroadcastIds, setDismissedBroadcastIds] = useState<Set<string>>(new Set());
  const [quoteIndex] = useState(() =>
    Math.floor(Math.random() * CABINET_QUOTES.length)
  );

  useEffect(() => {
    const stored = readTelegramUser();
    if (stored) {
      setProfile(stored);
      return;
    }

    const tgUser = (window as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number; first_name?: string; username?: string; photo_url?: string } } } } })
      .Telegram?.WebApp?.initDataUnsafe?.user;

    if (tgUser) {
      const snapshot = {
        firstName: tgUser.first_name,
        username: tgUser.username,
        photoUrl: tgUser.photo_url,
        telegramId: tgUser.id ? String(tgUser.id) : undefined,
      };
      setProfile(snapshot);
      storeTelegramUser(snapshot);
    }
  }, []);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    async function loadChatUnread() {
      try {
        const n = await getChatUnread();
        setChatUnread(n);
      } catch {
        setChatUnread(0);
      }
    }
    void loadChatUnread();
    const interval = setInterval(loadChatUnread, 15000);
    const onFocus = () => void loadChatUnread();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const data = await getProfile();
        setSubscriptionActive(Boolean(data.subscriptionActive));
        setSubscriptionEndsAt(data.subscriptionEndsAt ?? null);
        setDismissedBroadcastIds(new Set(data.dismissedBroadcastIds ?? []));
      } catch {
        setSubscriptionActive(false);
        setSubscriptionEndsAt(null);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    getBroadcasts()
      .then(setBroadcasts)
      .catch(() => setBroadcasts([]));
  }, []);

  async function dismissBroadcast(id: string) {
    setDismissedBroadcastIds((prev) => new Set(prev).add(id));
    try {
      await dismissBroadcastApi(id);
    } catch {
      setDismissedBroadcastIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const visibleBroadcasts = useMemo(
    () => broadcasts.filter((b) => !dismissedBroadcastIds.has(b.id)),
    [broadcasts, dismissedBroadcastIds]
  );

  const greetingName = useMemo(
    () => profile?.firstName ?? profile?.username ?? '',
    [profile?.firstName, profile?.username]
  );
  const avatarInitial = useMemo(() => {
    const source = profile?.firstName || profile?.username || '';
    return source ? source.charAt(0).toUpperCase() : 'C';
  }, [profile?.firstName, profile?.username]);

  const isGuest = Boolean(profile?.telegramId?.startsWith?.('guest-'));

  const currentQuoteText = useMemo(() => {
    const quote = getQuoteByIndex(quoteIndex);
    if (language === 'Английский') return quote.en;
    if (language === 'Узбекский') return quote.uz;
    return quote.ru;
  }, [quoteIndex, language]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Your cabinet',
        subtitle: 'Stay calm and track your progress.',
        chatTitle: 'Chat with support',
        chatNote: 'Ask a question and get help.',
        chatCta: 'Open chat',
        newMessage: 'New message',
        subscriptionTitle: 'Subscription',
        statusLabel: 'Status',
        expiresLabel: 'Expires',
        noSubscription: 'No active subscription',
        buy: 'Buy subscription',
        oneTime: 'Take a one-time test',
        activeSubscription: 'Active',
        oneTimeCardTitle: 'One-time test',
        oneTimeCardHint: 'Pay once and take one exam.',
        broadcastsTitle: 'Announcements',
        broadcastsEmpty: 'No announcements yet.',
        broadcastClose: 'Close',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Shaxsiy kabinet',
        subtitle: 'Tinchlikda o‘rganing va natijani kuzating.',
        chatTitle: 'Yordam chat',
        chatNote: 'Savol yuboring va javob oling.',
        chatCta: 'Chatni ochish',
        newMessage: 'Yangi xabar',
        subscriptionTitle: 'Obuna',
        statusLabel: 'Holat',
        expiresLabel: 'Tugash sanasi',
        noSubscription: 'Faol obuna yo‘q',
        buy: 'Obunani sotib olish',
        oneTime: 'Bir martalik test topshirish',
        activeSubscription: 'Faol',
        oneTimeCardTitle: 'Bir martalik test',
        oneTimeCardHint: 'Bir marta to‘lang va bitta imtihon topshiring.',
        broadcastsTitle: 'E\'lonlar',
        broadcastsEmpty: 'Hali e\'lonlar yo‘q.',
        broadcastClose: 'Yopish',
      };
    }
    return {
      title: 'Личный кабинет',
      subtitle: 'Спокойно учитесь и следите за прогрессом.',
      chatTitle: 'Чат с поддержкой',
      chatNote: 'Задайте вопрос и получите помощь.',
      chatCta: 'Открыть чат',
      newMessage: 'Новое сообщение',
      subscriptionTitle: 'Подписка',
      statusLabel: 'Статус',
      expiresLabel: 'Действует до',
      noSubscription: 'Активной подписки нет',
      buy: 'Купить подписку',
      oneTime: 'Сдать разовый тест',
      activeSubscription: 'Активна',
      oneTimeCardTitle: 'Разовый тест',
      oneTimeCardHint: 'Оплатите один раз и сдайте один экзамен.',
      broadcastsTitle: 'Объявления',
      broadcastsEmpty: 'Пока нет объявлений.',
      broadcastClose: 'Закрыть',
    };
  }, [language]);

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <PageHeader title={copy.title} subtitle={copy.subtitle} />

          <Card className="flex items-center gap-4">
            <div className="h-14 w-14 overflow-hidden rounded-full bg-slate-100 text-slate-700">
              {profile?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.photoUrl}
                  alt="Telegram avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-semibold">
                  {avatarInitial}
                </div>
              )}
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-base font-semibold text-slate-900">
                {greetingName ? `Hello, ${greetingName}` : 'Hello'}
              </p>
              <p className="text-sm text-slate-600">
                {currentQuoteText}
              </p>
            </div>
          </Card>

          {isGuest ? (
            <Card title={copy.oneTimeCardTitle}>
              <p className="text-sm text-slate-600">{copy.oneTimeCardHint}</p>
              <div className="mt-4">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => router.push('/exam/select?access=one-time')}
                >
                  {copy.oneTime}
                </Button>
              </div>
            </Card>
          ) : (
            <Card title={copy.subscriptionTitle}>
              <div className="flex flex-col gap-2 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{copy.statusLabel}</span>
                  <span
                    className={`inline-block rounded-lg px-2.5 py-1 font-semibold ${
                      subscriptionActive
                        ? 'border border-emerald-400 bg-emerald-50 text-emerald-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {subscriptionActive ? copy.activeSubscription : copy.noSubscription}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{copy.expiresLabel}</span>
                  <span className="font-semibold text-slate-900">
                    {subscriptionEndsAt
                      ? new Date(subscriptionEndsAt).toLocaleDateString()
                      : '—'}
                  </span>
                </div>
              </div>
              <div className="mt-6">
                <Button href="/cabinet/subscribe" size="lg" className="w-full">
                  {copy.buy}
                </Button>
              </div>
              {!subscriptionActive ? (
                <div className="mt-3">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full"
                    onClick={() => router.push('/exam/select?access=one-time')}
                  >
                    {copy.oneTime}
                  </Button>
                </div>
              ) : null}
            </Card>
          )}

          {visibleBroadcasts.length > 0 ? (
            <Card title={copy.broadcastsTitle}>
              <div className="flex flex-col gap-3">
                {visibleBroadcasts.slice(0, 5).map((b) => (
                  <div
                    key={b.id}
                    className="relative rounded-xl border border-slate-100 bg-slate-50/50 p-3 pr-10"
                  >
                    <p className="text-sm font-semibold text-slate-900">{b.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                      {b.text}
                    </p>
                    <p className="mt-2 text-[10px] text-slate-400">
                      {new Date(b.createdAt).toLocaleDateString()}
                    </p>
                    <button
                      type="button"
                      onClick={() => dismissBroadcast(b.id)}
                      className="absolute right-2 top-2 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                      aria-label={copy.broadcastClose}
                    >
                      {copy.broadcastClose}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="relative">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                {copy.chatTitle}
              </h2>
              {chatUnread > 0 ? (
                <span className="badge-glow inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white">
                  <span className="size-1.5 rounded-full bg-white" aria-hidden />
                  {copy.newMessage}
                  <span className="tabular-nums">({chatUnread > 99 ? '99+' : chatUnread})</span>
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate-600">{copy.chatNote}</p>
            <div className="mt-4">
              <Button href="/cabinet/chat" size="lg" className="w-full">
                {copy.chatCta}
              </Button>
            </div>
          </Card>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}

export default function CabinetPage() {
  return (
    <Suspense fallback={null}>
      <CabinetClient />
    </Suspense>
  );
}
