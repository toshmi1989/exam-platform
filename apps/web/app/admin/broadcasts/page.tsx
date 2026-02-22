'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import AdminGuard from '../components/AdminGuard';
import AdminNav from '../components/AdminNav';
import Button from '../../../components/Button';
import { readSettings, Language } from '../../../lib/uiSettings';
import { apiFetch } from '../../../lib/api/client';

type Broadcast = {
  id: string;
  title: string;
  segment: string;
  createdAt: number;
  imageData?: string;
};

type BroadcastStats = {
  broadcastId: string;
  status: 'pending' | 'sending' | 'done';
  total: number;
  sent: number;
  failed: number;
  startedAt: number;
  finishedAt?: number;
};

const MAX_IMAGE_BYTES = 200 * 1024;
const POLL_INTERVAL_MS = 1500;

export default function AdminBroadcastsPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [segment, setSegment] = useState('all');
  const [channel, setChannel] = useState<'telegram' | 'platform' | 'both'>('both');
  const [imageData, setImageData] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<Broadcast[]>([]);
  const [sending, setSending] = useState(false);
  const [activeStats, setActiveStats] = useState<BroadcastStats | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    void loadBroadcasts();
  }, []);

  // Stop polling when done
  useEffect(() => {
    if (activeStats?.status === 'done' && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [activeStats]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Broadcast',
        subtitle: 'Send a message to users.',
        titleLabel: 'Title',
        textLabel: 'Message',
        segmentLabel: 'Segment',
        send: 'Send',
        log: 'History',
        segments: {
          all: 'All users',
          subscribed: 'Subscribed',
          free: 'No subscription',
          active: 'Active (30d)',
        },
        upload: 'Add photo',
        imageTooLarge: 'Image is too large.',
        channelLabel: 'Send to',
        channelTelegram: 'Telegram only',
        channelPlatform: 'Platform only (in-app)',
        channelBoth: 'Both (Telegram + platform)',
        sending: 'Sending…',
        statusSending: 'Sending',
        statusDone: 'Done',
        statsDelivered: 'Delivered',
        statsFailed: 'Failed',
        statsTotal: 'Total',
        statsOf: 'of',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Xabar yuborish',
        subtitle: 'Foydalanuvchilarga xabar yuboring.',
        titleLabel: 'Sarlavha',
        textLabel: 'Xabar',
        segmentLabel: 'Segment',
        send: 'Yuborish',
        log: 'Tarix',
        segments: {
          all: 'Barcha foydalanuvchilar',
          subscribed: 'Obunachilar',
          free: 'Obunasizlar',
          active: 'Faollar (30 kun)',
        },
        upload: "Rasm qo'shish",
        imageTooLarge: 'Rasm juda katta.',
        channelLabel: 'Qayerga',
        channelTelegram: 'Faqat Telegram',
        channelPlatform: 'Faqat platforma (ilova ichida)',
        channelBoth: 'Ikkalasi (Telegram + platforma)',
        sending: 'Yuborilmoqda…',
        statusSending: 'Yuborilmoqda',
        statusDone: 'Tugadi',
        statsDelivered: 'Yetkazildi',
        statsFailed: 'Xato',
        statsTotal: 'Jami',
        statsOf: '/',
      };
    }
    return {
      title: 'Рассылка',
      subtitle: 'Отправка сообщения пользователям.',
      titleLabel: 'Заголовок',
      textLabel: 'Сообщение',
      segmentLabel: 'Сегмент',
      send: 'Отправить',
      log: 'История',
      segments: {
        all: 'Все пользователи',
        subscribed: 'Подписчики',
        free: 'Без подписки',
        active: 'Активные (30д)',
      },
      upload: 'Добавить фото',
      imageTooLarge: 'Изображение слишком большое.',
      channelLabel: 'Куда отправить',
      channelTelegram: 'Только в Telegram',
      channelPlatform: 'Только в платформу (чат в приложении)',
      channelBoth: 'В оба (Telegram + платформа)',
      sending: 'Отправляется…',
      statusSending: 'Отправляется',
      statusDone: 'Завершено',
      statsDelivered: 'Доставлено',
      statsFailed: 'Ошибок',
      statsTotal: 'Всего',
      statsOf: 'из',
    };
  }, [language]);

  async function loadBroadcasts() {
    const { response, data } = await apiFetch('/admin/broadcasts');
    if (!response.ok) return;
    const payload = data as { items?: Broadcast[] } | null;
    setItems(payload?.items ?? []);
  }

  function startPolling(broadcastId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { response, data } = await apiFetch(`/admin/broadcasts/${broadcastId}/stats`);
      if (!response.ok) return;
      const payload = data as { stats?: BroadcastStats } | null;
      if (payload?.stats) {
        setActiveStats(payload.stats);
        if (payload.stats.status === 'done') {
          setSending(false);
        }
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSend() {
    if (!title.trim() || !text.trim()) return;
    setSending(true);
    setActiveStats(null);

    const { response, data } = await apiFetch('/admin/broadcasts', {
      method: 'POST',
      json: { title, text, segment, channel, imageData },
    });

    if (response.ok) {
      const payload = data as { broadcast?: Broadcast } | null;
      if (payload?.broadcast) {
        setItems((prev) => [payload.broadcast as Broadcast, ...prev]);
        // Start polling stats for this broadcast
        if (channel === 'telegram' || channel === 'both') {
          setActiveStats({
            broadcastId: payload.broadcast.id,
            status: 'sending',
            total: 0,
            sent: 0,
            failed: 0,
            startedAt: Date.now(),
          });
          startPolling(payload.broadcast.id);
        } else {
          setSending(false);
        }
      } else {
        void loadBroadcasts();
        setSending(false);
      }
      setTitle('');
      setText('');
      setImageData(null);
    } else {
      setSending(false);
    }
  }

  function handleImageChange(file?: File | null) {
    if (!file) {
      setImageData(null);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMessage(copy.imageTooLarge);
      setImageData(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setErrorMessage(null);
      setImageData(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  const progressPct =
    activeStats && activeStats.total > 0
      ? Math.round((activeStats.sent + activeStats.failed) / activeStats.total * 100)
      : 0;

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <Card className="space-y-4">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={copy.titleLabel}
                disabled={sending}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE] disabled:opacity-50"
              />
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={copy.textLabel}
                rows={4}
                disabled={sending}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE] disabled:opacity-50"
              />
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">{copy.channelLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {(['telegram', 'platform', 'both'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={sending}
                      onClick={() => setChannel(key)}
                      className={`rounded-xl border px-4 py-2 text-sm transition disabled:opacity-50 ${
                        channel === key
                          ? 'border-[#2AABEE] bg-[#2AABEE] text-white'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {key === 'telegram'
                        ? copy.channelTelegram
                        : key === 'platform'
                          ? copy.channelPlatform
                          : copy.channelBoth}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">{copy.segmentLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(copy.segments).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      disabled={sending}
                      onClick={() => setSegment(key)}
                      className={`rounded-xl border px-4 py-2 text-sm transition disabled:opacity-50 ${
                        segment === key
                          ? 'border-[#2AABEE] bg-[#2AABEE] text-white'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {errorMessage ? (
                <p className="text-xs text-rose-500">{errorMessage}</p>
              ) : null}
              <div className="flex items-center gap-3">
                <label className={`cursor-pointer text-xs text-slate-500 ${sending ? 'opacity-50 pointer-events-none' : ''}`}>
                  {copy.upload}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) =>
                      handleImageChange(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
                <Button size="lg" onClick={handleSend} disabled={sending}>
                  {sending ? copy.sending : copy.send}
                </Button>
              </div>

              {/* Progress bar */}
              {activeStats && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className={activeStats.status === 'done' ? 'text-emerald-600' : 'text-[#2AABEE]'}>
                      {activeStats.status === 'done' ? copy.statusDone : copy.statusSending}
                    </span>
                    <span className="text-slate-500">
                      {activeStats.sent + activeStats.failed} {copy.statsOf} {activeStats.total}
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        activeStats.status === 'done' ? 'bg-emerald-500' : 'bg-[#2AABEE]'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  {/* Counters */}
                  <div className="flex gap-4 text-xs text-slate-600">
                    <span>
                      <span className="font-semibold text-emerald-600">{activeStats.sent}</span>{' '}
                      {copy.statsDelivered}
                    </span>
                    {activeStats.failed > 0 && (
                      <span>
                        <span className="font-semibold text-rose-500">{activeStats.failed}</span>{' '}
                        {copy.statsFailed}
                      </span>
                    )}
                    <span className="text-slate-400">
                      {copy.statsTotal}: {activeStats.total}
                    </span>
                  </div>
                </div>
              )}
            </Card>

            <Card title={copy.log}>
              <div className="flex flex-col gap-3 text-sm text-slate-600">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <span>{item.title}</span>
                    <span className="text-xs">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
