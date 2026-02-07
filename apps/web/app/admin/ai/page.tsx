'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import Button from '../../../components/Button';
import AdminGuard from '../components/AdminGuard';
import AdminNav from '../components/AdminNav';
import { readSettings, Language } from '../../../lib/uiSettings';
import { streamPrewarm, getAdminAiStats, type PrewarmProgress, type AdminAiStats } from '../../../lib/api';
import { API_BASE_URL } from '../../../lib/api/config';
import { readTelegramUser } from '../../../lib/telegramUser';

type ExamOption = { id: string; title: string };

export default function AdminAIPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [examId, setExamId] = useState<string>('');
  const [lang, setLang] = useState<'ru' | 'uz' | 'both'>('both');
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PrewarmProgress | null>(null);
  const [stats, setStats] = useState<AdminAiStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
    fetch(`${API_BASE_URL}/admin/exams?search=`, { headers })
      .then((r) => r.json())
      .then((data: { items?: { id: string; title: string }[] }) => {
        setExams(data?.items ?? []);
      })
      .catch(() => setExams([]));
  }, []);

  useEffect(() => {
    getAdminAiStats().then(setStats).catch(() => setStats(null));
  }, [running, progress?.done]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'AI — Generate explanations',
        subtitle: 'Pre-generate Зиёда explanations for exam questions.',
        exam: 'Exam (optional)',
        lang: 'Exam language filter',
        all: 'All questions',
        both: 'All',
        generate: 'Generate explanations',
        stop: 'Stop',
        progress: 'Generating',
        generated: 'Generated',
        skipped: 'Skipped',
        error: 'Error',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'AI — Tushuntirishlar',
        subtitle: "Imtihon savollari uchun Ziyoda tushuntirishlarini yaratish.",
        exam: 'Imtihon (ixtiyoriy)',
        lang: 'Imtihon tili filtri',
        all: 'Barcha savollar',
        both: 'Barchasi',
        generate: "Tushuntirishlarni yaratish",
        stop: 'To‘xtatish',
        progress: 'Yaratilmoqda',
        generated: 'Yaratilgan',
        skipped: "O'tkazib yuborilgan",
        error: 'Xato',
      };
    }
    return {
      title: 'AI — Генерация объяснений',
      subtitle: 'Предварительная генерация объяснений Зиёды для вопросов экзамена.',
      exam: 'Экзамен (необязательно)',
      lang: 'Фильтр по языку экзамена',
      all: 'Все вопросы',
      both: 'Все',
      generate: 'Сгенерировать объяснения',
      stop: 'Остановить',
      progress: 'Генерация',
      generated: 'Создано',
      skipped: 'Пропущено',
      error: 'Ошибка',
    };
  }, [language]);

  const handleStart = useCallback(() => {
    if (running) return;
    setRunning(true);
    setError(null);
    setProgress(null);
    abortRef.current = new AbortController();
    const params = {
      examId: examId.trim() || undefined,
      lang: lang === 'both' ? undefined : (lang as 'ru' | 'uz'),
    };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
    fetch(`${API_BASE_URL}/admin/ai/prewarm/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: abortRef.current.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Prewarm failed');
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No body');
        const dec = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const block of parts) {
            const m = block.match(/^data:\s*(.+)$/m);
            if (m) {
              try {
                const p = JSON.parse(m[1]) as PrewarmProgress;
                setProgress(p);
              } catch {
                // skip
              }
            }
          }
        }
        if (buffer) {
          const m = buffer.match(/^data:\s*(.+)$/m);
          if (m) {
            try {
              const p = JSON.parse(m[1]) as PrewarmProgress;
              setProgress(p);
            } catch {
              // skip
            }
          }
        }
      })
      .then(() => {
        setRunning(false);
        abortRef.current = null;
      })
      .catch((err) => {
        if (err?.name === 'AbortError') {
          setRunning(false);
        } else {
          setError(err?.message ?? copy.error);
          setRunning(false);
        }
        abortRef.current = null;
      });
  }, [running, examId, lang, copy.error]);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const p = progress;
  const percent = p && p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;

  return (
    <>
      <AnimatedPage>
        <main className="flex min-h-screen flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            {stats != null && (
              <Card>
                <p className="text-sm text-slate-500">Статистика</p>
                <p className="mt-2 text-slate-700">
                  Всего слотов объяснений: {stats.withExplanation}, отсутствует: {stats.missing}
                </p>
              </Card>
            )}

            <Card>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm text-slate-600">{copy.exam}</label>
                  <select
                    value={examId}
                    onChange={(e) => setExamId(e.target.value)}
                    disabled={running}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE] disabled:opacity-60"
                  >
                    <option value="">{copy.all}</option>
                    {exams.map((exam) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600">{copy.lang}</label>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as 'ru' | 'uz' | 'both')}
                    disabled={running}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE] disabled:opacity-60"
                  >
                    <option value="both">{copy.both}</option>
                    <option value="ru">RU</option>
                    <option value="uz">UZ</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleStart}
                    disabled={running}
                  >
                    ⚡ {copy.generate}
                  </Button>
                  {running && (
                    <Button type="button" variant="secondary" onClick={handleStop}>
                      {copy.stop}
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {running && p && (
              <Card>
                <p className="text-sm text-slate-600">
                  {copy.progress}: {p.processed} / {p.total} ({percent}%)
                </p>
                <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-[#2AABEE] transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-3 flex gap-4 text-sm">
                  <span className="text-emerald-600">{copy.generated}: {p.generated}</span>
                  <span className="text-slate-500">{copy.skipped}: {p.skipped}</span>
                </div>
              </Card>
            )}

            {error && (
              <Card>
                <p className="text-sm text-rose-600">{error}</p>
              </Card>
            )}
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
