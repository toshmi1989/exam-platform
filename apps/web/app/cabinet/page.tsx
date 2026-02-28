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
import { apiFetch } from '../../lib/api/client';
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
  const [expandedBroadcastId, setExpandedBroadcastId] = useState<string | null>(null);
  const [attestationQuery, setAttestationQuery] = useState('');
  const [attestationLoading, setAttestationLoading] = useState(false);
  const [attestationError, setAttestationError] = useState<string | null>(null);
  const [attestationResults, setAttestationResults] = useState<
    { full_name: string; specialty?: string | null; region?: string | null; stage: number; profession: string; exam_date?: string | null; exam_time?: string | null; source_url: string; published_date?: string | null }[]
  >([]);
  const [attestationDataCoverage, setAttestationDataCoverage] = useState<string | null>(null);
  const [attestationSearched, setAttestationSearched] = useState(false);
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

  async function searchAttestation() {
    const name = attestationQuery.trim();
    if (name.length < 3) {
      setAttestationError(copy.attestationMinChars);
      setAttestationResults([]);
      return;
    }
    setAttestationError(null);
    setAttestationDataCoverage(null);
    setAttestationSearched(false);
    setAttestationLoading(true);
    try {
      const { response, data } = await apiFetch(
        `/attestation/search?name=${encodeURIComponent(name)}`
      );
      setAttestationSearched(true);
      if (!response.ok) {
        const msg = typeof (data as { error?: string })?.error === 'string'
          ? (data as { error: string }).error
          : copy.attestationError;
        setAttestationError(msg);
        setAttestationResults([]);
        setAttestationDataCoverage(null);
        return;
      }
      type AttestationResultItem = {
        full_name: string;
        specialty?: string | null;
        region?: string | null;
        stage: number;
        profession: string;
        exam_date?: string | null;
        exam_time?: string | null;
        source_url: string;
        published_date?: string | null;
      };
      const payload = data as { items?: AttestationResultItem[]; dataCoverage?: string };
      const list = Array.isArray(payload?.items) ? payload.items : [];
      setAttestationResults(list);
      setAttestationDataCoverage(
        typeof payload?.dataCoverage === 'string' ? payload.dataCoverage : null
      );
    } catch {
      setAttestationSearched(true);
      setAttestationError(copy.attestationError);
      setAttestationResults([]);
      setAttestationDataCoverage(null);
    } finally {
      setAttestationLoading(false);
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
        broadcastBadge: 'Announcement',
        broadcastHint: 'You can close each announcement with the red button.',
        broadcastTapToOpen: 'Tap to read full',
        broadcastModalClose: 'Close',
        attestationTitle: 'Attestation',
        attestationHint: 'Find attestation date by full name.',
        attestationPlaceholder: 'Full name',
        attestationSearch: 'Search',
        attestationMinChars: 'Enter at least 3 characters.',
        attestationEmpty: 'No results found.',
        attestationError: 'Search error.',
        attestationStage1: 'Test',
        attestationStage2: 'Oral',
        attestationDoctor: 'Doctor',
        attestationNurse: 'Nurse',
        attestationSource: 'Source',
        attestationZiyodaFound: 'Ziyoda found {{count}} entries for you:',
        attestationZiyodaCardIntro: 'Found an entry!',
        attestationZiyodaExamDate: 'Exam date',
        attestationZiyodaDateTbd: 'see official source for date',
        attestationZiyodaSourceLink: 'Open official source',
        attestationZiyodaListFrom: 'List from',
        attestationCategoryLabel: 'Selected category',
        attestationStage1Short: 'Stage 1 (Test)',
        attestationStage2Short: 'Stage 2 (Oral)',
        attestationSecondInvitation: 'Invited a second time for this date ({{secondDate}}); first time was {{firstDate}}. If they do not participate the second time either, a new application will be required.',
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
        broadcastBadge: 'E\'lon',
        broadcastHint: 'Har bir e\'lonni qizil tugma bilan yoping.',
        broadcastTapToOpen: 'To\'liq o\'qish uchun bosing',
        broadcastModalClose: 'Yopish',
        attestationTitle: 'Attestatsiya',
        attestationHint: 'F.I.O. bo\'yicha attestatsiya sanasini bilib oling.',
        attestationPlaceholder: 'F.I.O.',
        attestationSearch: 'Qidirish',
        attestationMinChars: 'Kamida 3 ta belgi kiriting.',
        attestationEmpty: 'Hech narsa topilmadi.',
        attestationError: 'Qidiruv xatosi.',
        attestationStage1: 'Test',
        attestationStage2: 'Og\'zaki',
        attestationDoctor: 'Shifokor',
        attestationNurse: 'Hamshira',
        attestationSource: 'Manba',
        attestationZiyodaFound: 'Ziyoda siz uchun {{count}} ta yozuv topdi:',
        attestationZiyodaCardIntro: 'Yozuv topildi!',
        attestationZiyodaExamDate: 'Imtihon sanasi',
        attestationZiyodaDateTbd: 'sana rasmiy manbada',
        attestationZiyodaSourceLink: 'Rasmiy manbani ochish',
        attestationZiyodaListFrom: 'Ro\'yxat sanasi',
        attestationCategoryLabel: 'Tanlangan kategoriya',
        attestationStage1Short: 'Birinchi bosqich (test)',
        attestationStage2Short: 'Ikkinchi bosqich (og\'zaki)',
        attestationSecondInvitation: 'Ikkinchi marta shu sanaga ({{secondDate}}) taklif qilindi, birinchi marta {{firstDate}} edi. Agar ikkinchi marta ham qatnashmasa — yangi ariza topshirish kerak bo\'ladi.',
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
      broadcastBadge: 'Рассылка',
      broadcastHint: 'Каждое объявление можно закрыть красной кнопкой.',
      broadcastTapToOpen: 'Нажмите, чтобы открыть полностью',
      broadcastModalClose: 'Закрыть',
      attestationTitle: 'Аттестация',
      attestationHint: 'Узнать дату аттестации по ФИО.',
      attestationPlaceholder: 'ФИО',
      attestationSearch: 'Искать',
      attestationMinChars: 'Введите минимум 3 символа.',
      attestationEmpty: 'Ничего не найдено.',
      attestationError: 'Ошибка поиска.',
      attestationStage1: 'Тест',
      attestationStage2: 'Устный',
      attestationDoctor: 'Врач',
      attestationNurse: 'Медсестра',
      attestationSource: 'Источник',
      attestationZiyodaFound: 'Зиёда нашла для вас {{count}} записей:',
      attestationZiyodaCardIntro: 'Нашла запись!',
      attestationZiyodaExamDate: 'Дата экзамена',
      attestationZiyodaDateTbd: 'уточняется в официальном источнике',
      attestationZiyodaSourceLink: 'Подробности в официальном источнике',
      attestationZiyodaListFrom: 'Список от',
      attestationCategoryLabel: 'Выбранная категория',
      attestationStage1Short: '1-й этап (тест)',
      attestationStage2Short: '2-й этап (устный)',
      attestationSecondInvitation: 'Приглашена во второй раз на эту дату ({{secondDate}}), первый раз была {{firstDate}}. Если не будет участвовать и во второй раз — придётся сдавать новую заявку!',
    };
  }, [language]);

  const expandedBroadcast = useMemo(
    () => (expandedBroadcastId ? visibleBroadcasts.find((b) => b.id === expandedBroadcastId) : null),
    [expandedBroadcastId, visibleBroadcasts]
  );

  type AttestationRow = typeof attestationResults[number];
  const attestationDisplayGroups = useMemo(() => {
    const key = (r: AttestationRow) => `${r.full_name}|${r.stage}`;
    const groups = new Map<string, AttestationRow[]>();
    for (const r of attestationResults) {
      const k = key(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const getSortDate = (r: AttestationRow) => r.published_date || r.exam_date || '';
    const formatDate = (d: string) => (d.length === 10 && d.includes('-') ? d.split('-').reverse().join('.') : d);
    const out: ({ type: 'single'; row: AttestationRow } | { type: 'merged'; firstDate: string; secondDate: string; mainRow: AttestationRow })[] = [];
    groups.forEach((rows) => {
      rows.sort((a, b) => getSortDate(a).localeCompare(getSortDate(b)));
      if (rows.length === 1) {
        out.push({ type: 'single', row: rows[0] });
      } else {
        const firstDate = formatDate(getSortDate(rows[0]));
        const secondDate = formatDate(getSortDate(rows[rows.length - 1]));
        out.push({ type: 'merged', firstDate, secondDate, mainRow: rows[rows.length - 1] });
      }
    });
    return out;
  }, [attestationResults]);

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

          <Card title={copy.attestationTitle}>
            <p className="text-sm text-slate-600">{copy.attestationHint}</p>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={attestationQuery}
                onChange={(e) => setAttestationQuery(e.target.value)}
                placeholder={copy.attestationPlaceholder}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                aria-label={copy.attestationPlaceholder}
              />
              <Button
                size="md"
                onClick={searchAttestation}
                disabled={attestationQuery.trim().length < 3 || attestationLoading}
              >
                {attestationLoading ? '…' : copy.attestationSearch}
              </Button>
            </div>
            {attestationQuery.trim().length > 0 && attestationQuery.trim().length < 3 && (
              <p className="mt-2 text-xs text-amber-600">{copy.attestationMinChars}</p>
            )}
            {attestationError && (
              <p className="mt-2 text-sm text-red-600">{attestationError}</p>
            )}
            {attestationSearched && !attestationLoading && attestationResults.length === 0 && !attestationError && (
              <p className="mt-3 text-sm text-slate-500">
                {attestationDataCoverage ?? copy.attestationEmpty}
              </p>
            )}
            {!attestationLoading && attestationResults.length > 0 && (
              <div className="mt-4 space-y-4">
                <p className="text-sm font-medium text-slate-700">
                  👩‍⚕️ {copy.attestationZiyodaFound.replace('{{count}}', String(attestationResults.length))}
                </p>
                <ul className="flex flex-col gap-4">
                  {attestationDisplayGroups.map((item, i) => {
                    if (item.type === 'single') {
                      const r = item.row;
                      const stageLabel = r.stage === 1 ? copy.attestationStage1Short : copy.attestationStage2Short;
                      const professionLabel = r.profession === 'doctor' ? copy.attestationDoctor : copy.attestationNurse;
                      return (
                        <li
                          key={`single-${r.source_url}-${r.full_name}-${i}`}
                          className="rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/90 to-white p-4 text-sm shadow-sm"
                        >
                          <p className="mb-2 font-semibold text-violet-800">
                            ✨ {copy.attestationZiyodaCardIntro}
                          </p>
                          <p className="font-semibold text-slate-900">
                            👤 {r.full_name}
                          </p>
                          {(r.specialty || r.region) && (
                            <p className="mt-1 text-slate-600">
                              {r.specialty && <span>🩺 {r.specialty}</span>}
                              {r.specialty && r.region && ' · '}
                              {r.region && <span>📍 {r.region}</span>}
                            </p>
                          )}
                          <p className="mt-2 text-slate-600">
                            📋 {copy.attestationCategoryLabel}
                            <br />
                            <span className="font-medium">{stageLabel} · {professionLabel}</span>
                          </p>
                          <p className="mt-2 font-medium text-slate-800">
                            {r.exam_date ? (
                              <>
                                📅 {copy.attestationZiyodaExamDate}: {r.exam_date}
                                {r.exam_time ? ` ${r.exam_time}` : ''}
                              </>
                            ) : r.published_date ? (
                              <>
                                📅 {copy.attestationZiyodaListFrom}{' '}
                                {r.published_date.split('-').reverse().join('.')}
                              </>
                            ) : (
                              <>📅 {copy.attestationZiyodaExamDate}: {copy.attestationZiyodaDateTbd}</>
                            )}
                          </p>
                          <a
                            href={r.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-200"
                          >
                            🔗 {copy.attestationZiyodaSourceLink}
                          </a>
                        </li>
                      );
                    }
                    const { firstDate, secondDate, mainRow: r } = item;
                    const stageLabel = r.stage === 1 ? copy.attestationStage1Short : copy.attestationStage2Short;
                    const professionLabel = r.profession === 'doctor' ? copy.attestationDoctor : copy.attestationNurse;
                    return (
                      <li
                        key={`merged-${r.full_name}-${r.stage}-${i}`}
                        className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50/90 to-white p-4 text-sm shadow-sm"
                      >
                        <p className="mb-2 font-semibold text-amber-800">
                          ✨ {copy.attestationZiyodaCardIntro}
                        </p>
                        <p className="font-semibold text-slate-900">
                          👤 {r.full_name}
                        </p>
                        {(r.specialty || r.region) && (
                          <p className="mt-1 text-slate-600">
                            {r.specialty && <span>🩺 {r.specialty}</span>}
                            {r.specialty && r.region && ' · '}
                            {r.region && <span>📍 {r.region}</span>}
                          </p>
                        )}
                        <p className="mt-2 text-slate-600">
                          📋 {copy.attestationCategoryLabel}
                          <br />
                          <span className="font-medium">{stageLabel} · {professionLabel}</span>
                        </p>
                        <p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm font-medium text-amber-900">
                          ⚠️ {copy.attestationSecondInvitation.replace('{{firstDate}}', firstDate).replace('{{secondDate}}', secondDate)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {copy.attestationZiyodaListFrom} {secondDate}
                        </p>
                        <a
                          href={r.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-200"
                        >
                          🔗 {copy.attestationZiyodaSourceLink}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>

          {visibleBroadcasts.length > 0 ? (
            <Card title={copy.broadcastsTitle}>
              <p className="mb-3 text-xs text-slate-500">
                {copy.broadcastHint}
              </p>
              <div className="flex flex-col gap-3">
                {visibleBroadcasts.slice(0, 5).map((b) => (
                  <div
                    key={b.id}
                    className="relative rounded-xl border-2 border-amber-200 bg-amber-50/80 p-3 pr-24"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedBroadcastId(b.id)}
                      className="absolute inset-0 left-0 top-0 z-0 rounded-xl border-0 bg-transparent text-left outline-none focus:ring-2 focus:ring-amber-400 focus:ring-inset focus:ring-offset-0"
                      aria-label={copy.broadcastTapToOpen}
                    />
                    <span className="relative z-10 inline-block rounded bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                      {copy.broadcastBadge}
                    </span>
                    <p className="relative z-10 mt-2 text-sm font-semibold text-slate-900 pointer-events-none">{b.title}</p>
                    <p className="relative z-10 mt-1 line-clamp-2 text-xs text-slate-600 pointer-events-none">
                      {b.text}
                    </p>
                    <p className="relative z-10 mt-2 text-[10px] text-slate-500 pointer-events-none">
                      {new Date(b.createdAt).toLocaleDateString()}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissBroadcast(b.id);
                      }}
                      className="absolute right-2 top-2 z-20 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                      aria-label={copy.broadcastClose}
                    >
                      {copy.broadcastClose}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {expandedBroadcast ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity duration-200 ease-out"
              role="dialog"
              aria-modal="true"
              aria-labelledby="broadcast-modal-title"
              onClick={() => setExpandedBroadcastId(null)}
            >
              <div
                className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl transition-transform duration-200 ease-out"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-amber-50/80 px-4 py-3">
                  <span className="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                    {copy.broadcastBadge}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedBroadcastId(null)}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    {copy.broadcastModalClose}
                  </button>
                </div>
                <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
                  <h2 id="broadcast-modal-title" className="text-base font-semibold text-slate-900">
                    {expandedBroadcast.title}
                  </h2>
                  <p className="mt-2 text-[10px] text-slate-500">
                    {new Date(expandedBroadcast.createdAt).toLocaleDateString()}
                  </p>
                  <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
                    <p className="whitespace-pre-wrap text-sm text-slate-700">
                      {expandedBroadcast.text}
                    </p>
                  </div>
                </div>
              </div>
            </div>
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
