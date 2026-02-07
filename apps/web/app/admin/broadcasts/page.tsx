'use client';

import { useEffect, useMemo, useState } from 'react';
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

const MAX_IMAGE_BYTES = 200 * 1024;

export default function AdminBroadcastsPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [segment, setSegment] = useState('all');
  const [channel, setChannel] = useState<'telegram' | 'platform' | 'both'>('both');
  const [imageData, setImageData] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<Broadcast[]>([]);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    void loadBroadcasts();
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
        upload: 'Rasm qo‘shish',
        imageTooLarge: 'Rasm juda katta.',
        channelLabel: 'Qayerga',
        channelTelegram: 'Faqat Telegram',
        channelPlatform: 'Faqat platforma (ilova ichida)',
        channelBoth: 'Ikkalasi (Telegram + platforma)',
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
    };
  }, [language]);

  async function loadBroadcasts() {
    const { response, data } = await apiFetch('/admin/broadcasts');
    if (!response.ok) return;
    const payload = data as { items?: Broadcast[] } | null;
    setItems(payload?.items ?? []);
  }

  async function handleSend() {
    if (!title.trim() || !text.trim()) return;
    const { response, data } = await apiFetch('/admin/broadcasts', {
      method: 'POST',
      json: { title, text, segment, channel, imageData },
    });
    if (response.ok) {
      const payload = data as { broadcast?: Broadcast } | null;
      if (payload?.broadcast) {
        setItems((prev) => [payload.broadcast as Broadcast, ...prev]);
      } else {
        void loadBroadcasts();
      }
      setTitle('');
      setText('');
      setImageData(null);
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
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
              />
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={copy.textLabel}
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
              />
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">{copy.channelLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {(['telegram', 'platform', 'both'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setChannel(key)}
                      className={`rounded-xl border px-4 py-2 text-sm transition ${
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
                      onClick={() => setSegment(key)}
                      className={`rounded-xl border px-4 py-2 text-sm transition ${
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
                <label className="cursor-pointer text-xs text-slate-500">
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
                <Button size="lg" onClick={handleSend}>
                  {copy.send}
                </Button>
              </div>
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
