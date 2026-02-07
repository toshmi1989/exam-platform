'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AnimatedPage from '../../../../components/AnimatedPage';
import BottomNav from '../../../../components/BottomNav';
import Card from '../../../../components/Card';
import PageHeader from '../../../../components/PageHeader';
import Button from '../../../../components/Button';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import { readSettings, Language } from '../../../../lib/uiSettings';
import { streamPrewarm, getAdminAiStats, type PrewarmProgress, type AdminAiStats } from '../../../../lib/api';
import { API_BASE_URL } from '../../../../lib/api/config';
import { readTelegramUser } from '../../../../lib/telegramUser';

type ExamOption = { id: string; title: string };

export default function AdminAITestsPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [examId, setExamId] = useState<string>('');
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
  }, []);

  useEffect(() => {
    if (running || progress?.done) {
      getAdminAiStats().then(setStats).catch(() => setStats(null));
    }
  }, [running, progress?.done]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'AI — Tests',
        subtitle: 'Pre-generate Зиёда explanations for test questions.',
        exam: 'Exam (optional)',
        all: 'All questions',
        generate: 'Generate explanations',
        stop: 'Stop',
        progress: 'Generating',
        generated: 'Generated',
        skipped: 'Skipped',
        error: 'Error',
        statsTitle: 'Statistics',
        statsTotal: 'Total',
        statsMissing: 'Missing',
        statsByExam: 'By exam',
        back: 'Back to AI',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'AI — Testlar',
        subtitle: "Test savollari uchun Ziyoda tushuntirishlarini yaratish.",
        exam: 'Imtihon (ixtiyoriy)',
        all: 'Barcha savollar',
        generate: "Tushuntirishlarni yaratish",
        stop: 'To‘xtatish',
        progress: 'Yaratilmoqda',
        generated: 'Yaratilgan',
        skipped: "O'tkazib yuborilgan",
        error: 'Xato',
        statsTitle: 'Statistika',
        statsTotal: 'Jami',
        statsMissing: 'Yetishmayapti',
        statsByExam: 'Imtihon bo‘yicha',
        back: "AI ga qaytish",
      };
    }
    return {
      title: 'AI — Тесты',
      subtitle: 'Предгенерация объяснений Зиёды для тестовых вопросов.',
      exam: 'Экзамен (необязательно)',
      all: 'Все вопросы',
      generate: 'Сгенерировать объяснения',
      stop: 'Остановить',
      progress: 'Генерация',
      generated: 'Создано',
      skipped: 'Пропущено',
      error: 'Ошибка',
      statsTitle: 'Статистика',
      statsTotal: 'Всего',
      statsMissing: 'Отсутствует',
      statsByExam: 'По экзаменам',
      back: 'Назад к AI',
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
  }, [running, examId, copy.error]);

  const handleStop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
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

            <div>
              <Link href="/admin/ai">
                <Button type="button" variant="ghost" size="md">
                  ← {copy.back}
                </Button>
              </Link>
            </div>

            {stats != null && (
              <Card>
                <p className="text-sm font-medium text-slate-700">{copy.statsTitle}</p>
                <p className="mt-2 text-slate-600">
                  {copy.statsTotal}: {stats.withExplanation} / {stats.totalQuestions}, {copy.statsMissing}: {stats.missing}
                </p>
                {stats.byExam && stats.byExam.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-slate-500">{copy.statsByExam}</p>
                    <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-sm">
                      {stats.byExam.map((row) => (
                        <li key={row.examId} className="flex items-center justify-between gap-2 py-1">
                          <span className="min-w-0 truncate text-slate-700" title={row.title}>{row.title}</span>
                          <span className="shrink-0 tabular-nums text-slate-600">
                            {row.withExplanation} / {row.total}
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
                  <div className="h-full bg-[#2AABEE] transition-all duration-300" style={{ width: `${percent}%` }} />
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
