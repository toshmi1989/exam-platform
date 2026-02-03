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

type Thread = {
  telegramId: string;
  status: 'new' | 'open' | 'resolved';
  lastMessageAt: number;
  unreadCount?: number;
  lastText?: string;
  hasImage?: boolean;
};

type ChatMessage = {
  id: string;
  author: 'user' | 'admin';
  text?: string;
  imageData?: string;
  createdAt: number;
};

const MAX_IMAGE_BYTES = 200 * 1024;

export default function AdminChatsPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    void loadThreads();
  }, []);

  useEffect(() => {
    if (!activeThreadId) return;
    void loadMessages(activeThreadId);
  }, [activeThreadId]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Chats',
        subtitle: 'Reply to user questions.',
        reply: 'Reply',
        resolve: 'Mark resolved',
        blacklist: 'Blacklist',
        placeholder: 'Type a reply...',
        upload: 'Add photo',
        imageTooLarge: 'Image is too large.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Chatlar',
        subtitle: 'Foydalanuvchi savollariga javob bering.',
        reply: 'Javob berish',
        resolve: 'Yechildi deb belgilash',
        blacklist: 'Qora ro’yxat',
        placeholder: 'Javob yozing...',
        upload: 'Rasm qo‘shish',
        imageTooLarge: 'Rasm juda katta.',
      };
    }
    return {
      title: 'Чаты',
      subtitle: 'Ответы на вопросы пользователей.',
      reply: 'Ответить',
      resolve: 'Отметить решенным',
      blacklist: 'В черный список',
      placeholder: 'Введите ответ...',
      upload: 'Добавить фото',
      imageTooLarge: 'Изображение слишком большое.',
    };
  }, [language]);

  async function loadThreads() {
    const { response, data } = await apiFetch('/admin/chats');
    if (!response.ok) return;
    const payload = data as { threads?: Thread[] } | null;
    const nextThreads = payload?.threads ?? [];
    setThreads(nextThreads);
    if (!activeThreadId && nextThreads.length > 0) {
      setActiveThreadId(nextThreads[0].telegramId);
    }
  }

  async function loadMessages(telegramId: string) {
    const { response, data } = await apiFetch(`/admin/chats/${telegramId}`);
    if (!response.ok) return;
    const payload = data as { messages?: ChatMessage[] } | null;
    setMessages(payload?.messages ?? []);
  }

  async function handleSend() {
    if (!activeThreadId) return;
    const trimmed = reply.trim();
    if (!trimmed && !selectedImage) return;
    const { response, data } = await apiFetch(
      `/admin/chats/${activeThreadId}/reply`,
      {
        method: 'POST',
        json: { text: trimmed, imageData: selectedImage },
      }
    );
    if (!response.ok) return;
    const payload = data as { message?: ChatMessage } | null;
    if (payload?.message) {
      setMessages((prev) => [...prev, payload.message as ChatMessage]);
      setReply('');
      setSelectedImage(null);
    }
  }

  async function handleStatus(status: 'new' | 'open' | 'resolved') {
    if (!activeThreadId) return;
    await apiFetch(`/admin/chats/${activeThreadId}/status`, {
      method: 'POST',
      json: { status },
    });
    void loadThreads();
  }

  async function handleBlacklist() {
    if (!activeThreadId) return;
    await apiFetch('/admin/blacklist', {
      method: 'POST',
      json: { telegramId: activeThreadId, reason: 'Blocked from chat' },
    });
    void loadThreads();
  }

  function handleImageChange(file?: File | null) {
    if (!file) {
      setSelectedImage(null);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMessage(copy.imageTooLarge);
      setSelectedImage(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setErrorMessage(null);
      setSelectedImage(typeof reader.result === 'string' ? reader.result : null);
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

            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <Card className="flex flex-col gap-2">
                {threads.map((thread) => (
                  <button
                    key={thread.telegramId}
                    type="button"
                    onClick={() => setActiveThreadId(thread.telegramId)}
                    className={`rounded-xl px-3 py-2 text-left text-sm transition ${
                      activeThreadId === thread.telegramId
                        ? 'bg-[#2AABEE] text-white'
                        : 'border border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{thread.telegramId}</p>
                      {thread.unreadCount ? (
                        <span className="rounded-full bg-[#2AABEE] px-2 py-0.5 text-[10px] text-white">
                          {thread.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs opacity-80">
                      {thread.lastText ?? (thread.hasImage ? '📷' : '')}
                    </p>
                  </button>
                ))}
              </Card>

              <Card className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                        message.author === 'admin'
                          ? 'ml-auto bg-[#2AABEE] text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {message.text}
                      {message.imageData ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={message.imageData}
                          alt="attachment"
                          className="mt-2 w-full rounded-xl object-cover"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
                {errorMessage ? (
                  <p className="text-xs text-rose-500">{errorMessage}</p>
                ) : null}
                <div className="flex items-center gap-3">
                  <input
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={copy.placeholder}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                  />
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
                  <Button size="md" onClick={handleSend}>
                    {copy.reply}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => handleStatus('resolved')}
                  >
                    {copy.resolve}
                  </Button>
                  <Button variant="secondary" onClick={handleBlacklist}>
                    {copy.blacklist}
                  </Button>
                </div>
              </Card>
            </div>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
