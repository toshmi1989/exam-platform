'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/Button';
import { streamPrewarm, getAdminAiStats, type PrewarmProgress, type AdminAiStats } from '../../../lib/api';
import { apiFetch } from '../../../lib/api/client';
import { readSettings, Language } from '../../../lib/uiSettings';

type ExamOption = { id: string; title: string };

interface ZiyodaPrewarmModalProps {
  onClose: () => void;
}

export default function ZiyodaPrewarmModal({ onClose }: ZiyodaPrewarmModalProps) {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [examId, setExamId] = useState<string>('');
  const [lang, setLang] = useState<'ru' | 'uz' | 'both'>('both');
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PrewarmProgress | null>(null);
  const [stats, setStats] = useState<AdminAiStats | null>(null);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    apiFetch('/admin/exams?search=')
      .then(({ response, data }) => {
        if (!response.ok) return;
        const payload = data as { items?: { id: string; title: string }[] } | null;
        setExams(payload?.items ?? []);
      })
      .catch(() => setExams([]));
  }, []);

  useEffect(() => {
    if (!done && !running) return;
    getAdminAiStats().then(setStats).catch(() => setStats(null));
  }, [done, running]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Pre-generate Ziyoda',
        exam: 'Exam (optional)',
        lang: 'Language',
        all: 'All questions',
        both: 'Both (RU + UZ)',
        start: 'Start',
        close: 'Close',
        generated: 'Generated',
        skipped: 'Skipped',
        errors: 'Errors',
        progress: 'Progress',
        done: 'Done',
        error: 'Error',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: "Ziyodani oldindan yaratish",
        exam: 'Imtihon (ixtiyoriy)',
        lang: 'Til',
        all: 'Barcha savollar',
        both: 'Ikkalasi (RU + UZ)',
        start: 'Boshlash',
        close: 'Yopish',
        generated: 'Yaratilgan',
        skipped: "O'tkazib yuborilgan",
        errors: 'Xatolar',
        progress: 'Jarayon',
        done: 'Tugadi',
        error: 'Xato',
      };
    }
    return {
      title: 'Предварительно сгенерировать Зиёду',
      exam: 'Экзамен (необязательно)',
      lang: 'Язык',
      all: 'Все вопросы',
      both: 'Оба (RU + UZ)',
      start: 'Запустить',
      close: 'Закрыть',
      generated: 'Создано',
      skipped: 'Пропущено',
      errors: 'Ошибки',
      progress: 'Прогресс',
      done: 'Готово',
      error: 'Ошибка',
    };
  }, [language]);

  const handleStart = useCallback(() => {
    if (running) return;
    setRunning(true);
    setDone(false);
    setError(null);
    setProgress(null);
    const params = {
      examId: examId.trim() || undefined,
      lang: lang === 'both' ? undefined : (lang as 'ru' | 'uz'),
    };
    streamPrewarm(params, (p) => setProgress(p))
      .then(() => {
        setDone(true);
        setRunning(false);
      })
      .catch((err) => {
        setError(err?.message ?? copy.error);
        setRunning(false);
      });
  }, [running, examId, lang, copy.error]);

  const p = progress;
  const percent = p && p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ziyoda-prewarm-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="ziyoda-prewarm-title" className="text-lg font-semibold text-slate-900">
          🤖 {copy.title}
        </h2>

        {!running && !done ? (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <label className="block text-sm text-slate-600">{copy.exam}</label>
              <select
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
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
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
              >
                <option value="both">{copy.both}</option>
                <option value="ru">RU</option>
                <option value="uz">UZ</option>
              </select>
            </div>
          </div>
        ) : null}

        {running && p ? (
          <div className="mt-4 space-y-3">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-[#2AABEE] transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-sm text-slate-600">
              {copy.progress}: {p.processed} / {p.total} ({percent}%)
            </p>
            <div className="flex gap-4 text-sm">
              <span className="text-emerald-600">{copy.generated}: {p.generated}</span>
              <span className="text-slate-500">{copy.skipped}: {p.skipped}</span>
              {(p.errors ?? 0) > 0 && (
                <span className="text-rose-600">{copy.errors}: {p.errors}</span>
              )}
            </div>
          </div>
        ) : null}

        {done && (
          <div className="mt-4">
            <p className="text-sm font-medium text-emerald-600">{copy.done}</p>
            {stats != null && (
              <p className="mt-2 text-sm text-slate-600">
                Всего объяснений: {stats.withExplanation}, отсутствует: {stats.missing}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-rose-600">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {done || error ? (
            <Button type="button" onClick={onClose}>
              {copy.close}
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose} disabled={running}>
                {copy.close}
              </Button>
              <Button type="button" onClick={handleStart} disabled={running}>
                {copy.start}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
