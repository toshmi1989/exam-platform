'use client';

import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BackButton from '../../../components/BackButton';
import BottomNav from '../../../components/BottomNav';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import { readSettings, Language } from '../../../lib/uiSettings';
import { apiFetch } from '../../../lib/api/client';

export const dynamic = 'force-dynamic';

type ChatMessage = {
  id: string;
  text: string;
  author: 'user' | 'admin';
  createdAt: number;
  imageData?: string;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB (screenshots 2–3 MB)

export default function ChatPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    void loadMessages();
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Support chat',
        subtitle: 'Ask a question and get help.',
        placeholder: 'Type your message...',
        send: 'Send',
        empty: 'Write your first message to start the chat.',
        refreshed: 'History refreshed.',
        upload: 'Add photo',
        imageTooLarge: 'Image is too large.',
        photoAttached: 'Photo attached.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Yordam chat',
        subtitle: 'Savol yuboring va javob oling.',
        placeholder: 'Xabaringizni yozing...',
        send: 'Yuborish',
        empty: 'Chatni boshlash uchun birinchi xabarni yozing.',
        refreshed: 'Tarix yangilandi.',
        upload: 'Rasm qo‘shish',
        imageTooLarge: 'Rasm juda katta.',
        photoAttached: 'Rasm qo‘shildi.',
      };
    }
    return {
      title: 'Чат с поддержкой',
      subtitle: 'Задайте вопрос и получите помощь.',
      placeholder: 'Введите сообщение...',
      send: 'Отправить',
      empty: 'Напишите первое сообщение, чтобы начать чат.',
      refreshed: 'История обновлена.',
      upload: 'Добавить фото',
      imageTooLarge: 'Изображение слишком большое.',
      photoAttached: 'Фото прикреплено.',
    };
  }, [language]);

  async function loadMessages() {
    const { response, data } = await apiFetch('/chat/messages');
    if (!response.ok) {
      return;
    }
    const payload = data as { messages?: ChatMessage[] } | null;
    setMessages(payload?.messages ?? []);
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

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed && !selectedImage) return;
    setIsSending(true);

    const { response, data } = await apiFetch('/chat/messages', {
      method: 'POST',
      json: { text: trimmed, imageData: selectedImage },
    });

    if (response.ok) {
      const payload = data as { message?: ChatMessage } | null;
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message as ChatMessage]);
      }
      setText('');
      setSelectedImage(null);
    }

    setIsSending(false);
  }

  return (
    <>
      {lightboxImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-label="Просмотр фото"
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-lg font-bold text-black"
            onClick={() => setLightboxImage(null)}
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxImage}
            alt=""
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <BackButton placement="bottom" />
          <PageHeader title={copy.title} subtitle={copy.subtitle} />

          <Card className="flex min-h-[320px] flex-col gap-4">
            {messages.length === 0 ? (
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {copy.empty}
                <div className="mt-2 text-xs text-slate-500">
                  {copy.refreshed}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                      message.author === 'user'
                        ? 'ml-auto bg-[#2AABEE] text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {message.text}
                    {message.imageData ? (
                      <button
                        type="button"
                        onClick={() => setLightboxImage(message.imageData ?? null)}
                        className="mt-2 block w-full cursor-pointer rounded-xl text-left"
                        title="Открыть в полном размере"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={message.imageData}
                          alt="attachment"
                          className="w-full rounded-xl object-cover"
                        />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {errorMessage ? (
              <p className="text-xs text-rose-500">{errorMessage}</p>
            ) : null}

            {selectedImage ? (
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedImage}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1 text-xs text-slate-500">
                  {copy.photoAttached}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="shrink-0 rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-300"
                >
                  ×
                </button>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={copy.placeholder}
                className="w-full min-w-0 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer shrink-0 text-xs text-slate-500 underline">
                  {copy.upload}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => handleImageChange(event.target.files?.[0] ?? null)}
                  />
                </label>
                <Button size="md" onClick={handleSend} disabled={isSending} className="shrink-0">
                  {copy.send}
                </Button>
              </div>
            </div>
          </Card>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
