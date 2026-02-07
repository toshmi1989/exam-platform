'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import Button from '../../../components/Button';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import { readSettings, Language } from '../../../lib/uiSettings';
import {
  getAdminOralStats,
  streamOralPrewarm,
  type AdminOralStats,
  type OralPrewarmProgress,
} from '../../../lib/api';
import { API_BASE_URL } from '../../../lib/api/config';
import { readTelegramUser } from '../../../lib/telegramUser';

type ExamOption = { id: string; title: string };

export default function AdminAIOralPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [examId, setExamId] = useState<string>('');
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<OralPrewarmProgress | null>(null);
  const [stats, setStats] = useState<AdminOralStats | null>(null);
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
    getAdminOralStats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    if (running || progress?.done) {
      getAdminOralStats().then(setStats).catch(() => setStats(null));
    }
  }, [running, progress?.done]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'AI — Oral answers',
        subtitle: 'Pre-generate Ziyoda answers for oral questions.',
        exam: 'Exam (optional)',
        all: 'All oral questions',
        generate: 'Generate answers',
        stop: 'Stop',
        progress: 'Generating',
        generated: 'Generated',
        skipped: 'Skipped',
        errors: 'Errors',
        error: 'Error',
        statsTitle: 'Statistics',
        statsTotal: 'Oral questions',
        statsMissing: 'Missing',
        statsByDirection: 'By exam',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'AI — Og\'zaki javoblar',
        subtitle: "Og'zaki savollar uchun Ziyoda javoblarini yaratish.",
        exam: 'Imtihon (ixtiyoriy)',
        all: 'Barcha og\'zaki savollar',
        generate: "Javoblarni yaratish",
        stop: 'To‘xtatish',
        progress: 'Yaratilmoqda',
        generated: 'Yaratilgan',
        skipped: "O'tkazib yuborilgan",
        errors: 'Xatolar',
        error: 'Xato',
        statsTitle: 'Statistika',
        statsTotal: "Og'zaki savollar",
        statsMissing: 'Yetishmayapti',
        statsByDirection: 'Imtihon bo‘yicha',
      };
    }
    return {
      title: 'AI — Устные ответы',
      subtitle: 'Предгенерация ответов Зиёды для устных вопросов.',
      exam: 'Экзамен (необязательно)',
      all: 'Все устные вопросы',
      generate: 'Сгенерировать ответы',
      stop: 'Остановить',
      progress: 'Генерация',
      generated: 'Создано',
      skipped: 'Пропущено',
      errors: 'Ошибки',
      error: 'Ошибка',
      statsTitle: 'Статистика',
      statsTotal: 'Устных вопросов',
      statsMissing: 'Без ответа',
      statsByDirection: 'По экзаменам',
    };
  }, [language]);

  const handleStart = useCallback(() => {
    if (running) return;
    setRunning(true);
    setError(null);
    setProgress(null);
    abortRef.current = new AbortController();
    const params = { examId: examId.trim() || undefined };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
    fetch(`${API_BASE_URL}/admin/ai/oral/prewarm/stream`, {
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
                const p = JSON.parse(m[1]) as OralPrewarmProgress;
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
              const p = JSON.parse(m[1]) as OralPrewarmProgress;
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
        if (err?.name !== 'AbortError') {
          setError(err?.message ?? copy.error);
        }
        setRunning(false);
        abortRef.current = null;
      });
  }, [running, examId, copy.error]);

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
                <p className="text-sm font-medium text-slate-700">{copy.statsTitle}</p>
                <p className="mt-2 text-slate-600">
                  {copy.statsTotal}: {stats.withAnswer} / {stats.totalOralQuestions}, {copy.statsMissing}: {stats.missing}
                </p>
                {stats.byExam && stats.byExam.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-slate-500">{copy.statsByDirection}</p>
                    <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-sm">
                      {stats.byExam.map((row) => (
                        <li key={row.examId} className="flex items-center justify-between gap-2 py-1">
                          <span className="min-w-0 truncate text-slate-700" title={row.title}>
                            {row.title}
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-600">
                            {row.withAnswer} / {row.total}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                <div className="flex gap-2">
                  <Button type="button" onClick={handleStart} disabled={running}>
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
                  <span className="text-emerald-600">
                    {copy.generated}: {p.generated}
                  </span>
                  <span className="text-slate-500">
                    {copy.skipped}: {p.skipped}
                  </span>
                  {(p.errors ?? 0) > 0 && (
                    <span className="text-rose-600">
                      {copy.errors}: {p.errors}
                    </span>
                  )}
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
