'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import Button from '../../../components/Button';
import AdminGuard from '../components/AdminGuard';
import AdminNav from '../components/AdminNav';
import { readSettings, Language } from '../../../lib/uiSettings';
import {
  getAdminAiStats,
  getAdminOralStats,
  getKnowledgeStats,
  uploadKnowledge,
  reindexKnowledgeStream,
  type AdminAiStats,
  type AdminOralStats,
  type PrewarmProgress,
  type OralPrewarmProgress,
  type KnowledgeStats,
  type ReindexProgress,
} from '../../../lib/api';
import { API_BASE_URL } from '../../../lib/api/config';
import { readTelegramUser } from '../../../lib/telegramUser';

type AiTab = 'test' | 'oral' | 'ziyoda';
type ExamOption = { id: string; title: string; type?: string; category?: string };

function streamPrewarmFetch(
  url: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  onProgress: (p: PrewarmProgress) => void
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const user = readTelegramUser();
  if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
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
              onProgress(JSON.parse(m[1]) as PrewarmProgress);
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
            onProgress(JSON.parse(m[1]) as PrewarmProgress);
          } catch {
            // skip
          }
        }
      }
    });
}

function streamOralPrewarmFetch(
  body: Record<string, unknown>,
  signal: AbortSignal,
  onProgress: (p: OralPrewarmProgress) => void
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const user = readTelegramUser();
  if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
  return fetch(`${API_BASE_URL}/admin/ai/oral/prewarm/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
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
              onProgress(JSON.parse(m[1]) as OralPrewarmProgress);
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
            onProgress(JSON.parse(m[1]) as OralPrewarmProgress);
          } catch {
            // skip
          }
        }
      }
    });
}

function AdminAIPageContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [tab, setTab] = useState<AiTab>(() =>
    tabParam === 'ziyoda' ? 'ziyoda' : tabParam === 'oral' ? 'oral' : tabParam === 'test' ? 'test' : 'test'
  );

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'ziyoda' || t === 'oral' || t === 'test') setTab(t);
  }, [searchParams]);

  const [testExams, setTestExams] = useState<ExamOption[]>([]);
  const [oralExams, setOralExams] = useState<ExamOption[]>([]);

  // Test state
  const [testExamId, setTestExamId] = useState('');
  const [testStats, setTestStats] = useState<AdminAiStats | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testProgress, setTestProgress] = useState<PrewarmProgress | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Oral state
  const [oralExamId, setOralExamId] = useState('');
  const [oralStats, setOralStats] = useState<AdminOralStats | null>(null);
  const [oralRunning, setOralRunning] = useState(false);
  const [oralProgress, setOralProgress] = useState<OralPrewarmProgress | null>(null);
  const [oralError, setOralError] = useState<string | null>(null);

  const testAbortRef = useRef<AbortController | null>(null);
  const oralAbortRef = useRef<AbortController | null>(null);

  // Ziyoda RAG state
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [reindexRunning, setReindexRunning] = useState(false);
  const [reindexProgress, setReindexProgress] = useState<ReindexProgress | null>(null);
  const [reindexError, setReindexError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
    Promise.all([
      fetch(`${API_BASE_URL}/admin/exams?search=&type=TEST`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/admin/exams?search=&type=ORAL`, { headers }).then((r) => r.json()),
    ])
      .then(([testData, oralData]) => {
        setTestExams((testData as { items?: ExamOption[] })?.items ?? []);
        setOralExams((oralData as { items?: ExamOption[] })?.items ?? []);
      })
      .catch(() => {
        setTestExams([]);
        setOralExams([]);
      });
  }, []);

  useEffect(() => {
    getAdminAiStats().then(setTestStats).catch(() => setTestStats(null));
  }, [tab, testRunning, testProgress?.done]);

  useEffect(() => {
    getAdminOralStats().then(setOralStats).catch(() => setOralStats(null));
  }, [tab, oralRunning, oralProgress?.done]);

  useEffect(() => {
    if (tab === 'ziyoda') {
      getKnowledgeStats().then(setKnowledgeStats).catch(() => setKnowledgeStats(null));
    }
  }, [tab, uploadSuccess, pasteSuccess, reindexProgress?.done]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'AI',
        subtitle: 'Generate Зиёда explanations and oral answers.',
        tabTests: 'Tests',
        tabOral: 'Oral',
        tabZiyoda: 'Ziyoda AI',
        exam: 'Exam (optional)',
        all: 'All questions',
        generate: 'Generate explanations',
        generateMissing: 'Generate missing only',
        generateAll: 'Generate all (overwrite)',
        stop: 'Stop',
        progress: 'Generating',
        generated: 'Generated',
        skipped: 'Skipped',
        errors: 'Errors',
        error: 'Error',
        statsTitle: 'Statistics',
        statsTotal: 'Total',
        statsMissing: 'Missing',
        statsByExam: 'By exam',
        oralTotal: 'Oral questions',
        knowledgeBase: 'Knowledge Base',
        reindex: 'Reindex',
        upload: 'Upload',
        uploadHint: 'PDF, DOCX, TXT',
        statsEntries: 'Chunks',
        statsCache: 'Cached answers',
        pasteLabel: 'Paste text',
        pastePlaceholder: 'Paste rules, FAQs, or any text here…',
        pasteTitleLabel: 'Title (optional)',
        addToBase: 'Add to knowledge base',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'AI',
        subtitle: "Ziyoda tushuntirishlari va og'zaki javoblarni yaratish.",
        tabTests: 'Testlar',
        tabOral: "Og'zaki",
        tabZiyoda: 'Ziyoda AI',
        exam: 'Imtihon (ixtiyoriy)',
        all: 'Barcha savollar',
        generate: "Tushuntirishlarni yaratish",
        generateMissing: "Yetishmayotganlarni yaratish",
        generateAll: "Barchasini qayta yaratish",
        stop: 'To‘xtatish',
        progress: 'Yaratilmoqda',
        generated: 'Yaratilgan',
        skipped: "O'tkazib yuborilgan",
        errors: 'Xatolar',
        error: 'Xato',
        statsTitle: 'Statistika',
        statsTotal: 'Jami',
        statsMissing: 'Yetishmayapti',
        statsByExam: 'Imtihon bo‘yicha',
        oralTotal: "Og'zaki savollar",
        knowledgeBase: 'Bilimlar bazasi',
        reindex: 'Qayta indekslash',
        upload: 'Yuklash',
        uploadHint: 'PDF, DOCX, TXT',
        statsEntries: 'Bloklar',
        statsCache: 'Kesh javoblar',
        pasteLabel: "Matn qo'shish",
        pastePlaceholder: "Qoidalar, savol-javoblar yoki istalgan matnni shu yerga joylashtiring…",
        pasteTitleLabel: 'Sarlavha (ixtiyoriy)',
        addToBase: "Bilimlar bazasiga qo'shish",
      };
    }
    return {
      title: 'AI',
      subtitle: 'Генерация объяснений Зиёды и устных ответов.',
      tabTests: 'Тесты',
      tabOral: 'Устные',
      tabZiyoda: 'Зиёда AI',
      exam: 'Экзамен (необязательно)',
      all: 'Все вопросы',
      generate: 'Сгенерировать объяснения',
      generateMissing: 'Сгенерировать недостающие',
      generateAll: 'Сгенерировать все',
      stop: 'Остановить',
      progress: 'Генерация',
      generated: 'Создано',
      skipped: 'Пропущено',
      errors: 'Ошибки',
      error: 'Ошибка',
      statsTitle: 'Статистика',
      statsTotal: 'Всего',
      statsMissing: 'Отсутствует',
      statsByExam: 'По экзаменам',
      oralTotal: 'Устных вопросов',
      knowledgeBase: 'База знаний',
      reindex: 'Переиндексация',
      upload: 'Загрузить',
      uploadHint: 'PDF, DOCX, TXT',
      statsEntries: 'Фрагментов',
      statsCache: 'Кэш ответов',
      pasteLabel: 'Вставить текст',
      pastePlaceholder: 'Вставьте сюда правила, ответы на вопросы или любой текст…',
      pasteTitleLabel: 'Название (необязательно)',
      addToBase: 'Добавить в базу знаний',
    };
  }, [language]);

  const handleTestStart = useCallback((mode: 'missing' | 'all') => {
    if (testRunning) return;
    setTestRunning(true);
    setTestError(null);
    setTestProgress(null);
    testAbortRef.current = new AbortController();
    const params = {
      examId: testExamId.trim() || undefined,
      mode,
    };
    streamPrewarmFetch(
      `${API_BASE_URL}/admin/ai/prewarm/stream`,
      params,
      testAbortRef.current.signal,
      setTestProgress
    )
      .then(() => {
        setTestRunning(false);
        testAbortRef.current = null;
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setTestError(err?.message ?? copy.error);
        setTestRunning(false);
        testAbortRef.current = null;
      });
  }, [testRunning, testExamId, copy.error]);

  const handleOralStart = useCallback((mode: 'missing' | 'all') => {
    if (oralRunning) return;
    setOralRunning(true);
    setOralError(null);
    setOralProgress(null);
    oralAbortRef.current = new AbortController();
    const body = {
      examId: oralExamId.trim() || undefined,
      mode,
    };
    streamOralPrewarmFetch(body, oralAbortRef.current.signal, setOralProgress)
      .then(() => {
        setOralRunning(false);
        oralAbortRef.current = null;
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setOralError(err?.message ?? copy.error);
        setOralRunning(false);
        oralAbortRef.current = null;
      });
  }, [oralRunning, oralExamId, copy.error]);

  const handleTestStop = useCallback(() => {
    testAbortRef.current?.abort();
  }, []);

  const handleOralStop = useCallback(() => {
    oralAbortRef.current?.abort();
  }, []);

  const testP = testProgress;
  const testPercent = testP && testP.total > 0 ? Math.round((testP.processed / testP.total) * 100) : 0;
  const oralP = oralProgress;
  const oralPercent = oralP && oralP.total > 0 ? Math.round((oralP.processed / oralP.total) * 100) : 0;

  return (
    <>
      <AnimatedPage>
        <main className="flex min-h-screen flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <div className="flex gap-2">
              <Button
                size="md"
                variant={tab === 'test' ? 'primary' : 'secondary'}
                onClick={() => setTab('test')}
              >
                {copy.tabTests}
              </Button>
              <Button
                size="md"
                variant={tab === 'oral' ? 'primary' : 'secondary'}
                onClick={() => setTab('oral')}
              >
                {copy.tabOral}
              </Button>
              <Button
                size="md"
                variant={tab === 'ziyoda' ? 'primary' : 'secondary'}
                onClick={() => setTab('ziyoda')}
              >
                {copy.tabZiyoda}
              </Button>
            </div>

            {tab === 'test' && (
              <>
                {testStats != null && (
                  <Card>
                    <p className="text-sm font-medium text-slate-700">{copy.statsTitle}</p>
                    <p className="mt-2 text-slate-600">
                      {copy.statsTotal}: {testStats.withExplanation} / {testStats.totalQuestions}, {copy.statsMissing}: {testStats.missing}
                    </p>
                    {testStats.byExam && testStats.byExam.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium text-slate-500">{copy.statsByExam}</p>
                        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-sm">
                          {testStats.byExam.map((row) => (
                            <li key={row.examId} className="flex items-center justify-between gap-2 py-1">
                              <span className="min-w-0 truncate text-slate-700" title={row.title}>{row.title}</span>
                              <span className="shrink-0 tabular-nums text-slate-600">{row.withExplanation} / {row.total}</span>
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
                        value={testExamId}
                        onChange={(e) => setTestExamId(e.target.value)}
                        disabled={testRunning}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE] disabled:opacity-60"
                      >
                        <option value="">{copy.all}</option>
                        {testExams.map((exam) => (
                          <option key={exam.id} value={exam.id}>{exam.title}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => handleTestStart('missing')}
                        disabled={testRunning}
                      >
                        ⚡ {copy.generateMissing}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleTestStart('all')}
                        disabled={testRunning}
                      >
                        🔄 {copy.generateAll}
                      </Button>
                      {testRunning && (
                        <Button type="button" variant="secondary" onClick={handleTestStop}>
                          {copy.stop}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
                {testRunning && testP && (
                  <Card>
                    <p className="text-sm text-slate-600">{copy.progress}: {testP.processed} / {testP.total} ({testPercent}%)</p>
                    <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full bg-[#2AABEE] transition-all duration-300" style={{ width: `${testPercent}%` }} />
                    </div>
                    <div className="mt-3 flex gap-4 text-sm">
                      <span className="text-emerald-600">{copy.generated}: {testP.generated}</span>
                      <span className="text-slate-500">{copy.skipped}: {testP.skipped}</span>
                    </div>
                  </Card>
                )}
                {testError && (
                  <Card><p className="text-sm text-rose-600">{testError}</p></Card>
                )}
              </>
            )}

            {tab === 'oral' && (
              <>
                {oralStats != null && (
                  <Card>
                    <p className="text-sm font-medium text-slate-700">{copy.statsTitle}</p>
                    <p className="mt-2 text-slate-600">
                      {copy.oralTotal}: {oralStats.withAnswer} / {oralStats.totalOralQuestions}, {copy.statsMissing}: {oralStats.missing}
                    </p>
                    {oralStats.byExam && oralStats.byExam.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium text-slate-500">{copy.statsByExam}</p>
                        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-sm">
                          {oralStats.byExam.map((row) => {
                            const label = row.category ? `${row.title} (${row.category})` : row.title;
                            return (
                              <li key={row.examId} className="flex items-center justify-between gap-2 py-1">
                                <span className="min-w-0 truncate text-slate-700" title={label}>{label}</span>
                                <span className="shrink-0 tabular-nums text-slate-600">{row.withAnswer} / {row.total}</span>
                              </li>
                            );
                          })}
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
                        value={oralExamId}
                        onChange={(e) => setOralExamId(e.target.value)}
                        disabled={oralRunning}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE] disabled:opacity-60"
                      >
                        <option value="">{copy.all}</option>
                        {oralExams.map((exam) => {
                          const label = exam.category ? `${exam.title} (${exam.category})` : exam.title;
                          return (
                            <option key={exam.id} value={exam.id}>{label}</option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => handleOralStart('missing')}
                        disabled={oralRunning}
                      >
                        ⚡ {copy.generateMissing}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleOralStart('all')}
                        disabled={oralRunning}
                      >
                        🔄 {copy.generateAll}
                      </Button>
                      {oralRunning && (
                        <Button type="button" variant="secondary" onClick={handleOralStop}>
                          {copy.stop}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
                {oralRunning && oralP && (
                  <Card>
                    <p className="text-sm text-slate-600">{copy.progress}: {oralP.processed} / {oralP.total} ({oralPercent}%)</p>
                    <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full bg-[#2AABEE] transition-all duration-300" style={{ width: `${oralPercent}%` }} />
                    </div>
                    <div className="mt-3 flex gap-4 text-sm">
                      <span className="text-emerald-600">{copy.generated}: {oralP.generated}</span>
                      <span className="text-slate-500">{copy.skipped}: {oralP.skipped}</span>
                      {(oralP.errors ?? 0) > 0 && (
                        <span className="text-rose-600">{copy.errors}: {oralP.errors}</span>
                      )}
                    </div>
                  </Card>
                )}
                {oralError && (
                  <Card><p className="text-sm text-rose-600">{oralError}</p></Card>
                )}
              </>
            )}

            {tab === 'ziyoda' && (
              <>
                {knowledgeStats != null && (
                  <Card>
                    <p className="text-sm font-medium text-slate-700">{copy.statsTitle}</p>
                    <p className="mt-2 text-slate-600">
                      {copy.statsEntries}: {knowledgeStats.totalEntries}, {copy.statsCache}: {knowledgeStats.totalCacheEntries}
                    </p>
                  </Card>
                )}
                <Card>
                  <p className="text-sm font-medium text-slate-700">{copy.pasteLabel}</p>
                  <p className="mt-1 text-xs text-slate-500">{copy.pastePlaceholder}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <textarea
                      value={pasteText}
                      onChange={(e) => {
                        setPasteText(e.target.value);
                        setPasteError(null);
                        setPasteSuccess(null);
                      }}
                      placeholder={copy.pastePlaceholder}
                      rows={8}
                      disabled={pasteLoading}
                      className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#2AABEE] focus:outline-none disabled:opacity-60"
                    />
                    <div>
                      <label className="block text-xs text-slate-500">{copy.pasteTitleLabel}</label>
                      <input
                        type="text"
                        value={pasteTitle}
                        onChange={(e) => setPasteTitle(e.target.value)}
                        placeholder="Напр. Правила ZiyoMed"
                        disabled={pasteLoading}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#2AABEE] focus:outline-none disabled:opacity-60"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={async () => {
                        if (pasteLoading || !pasteText.trim()) return;
                        setPasteLoading(true);
                        setPasteError(null);
                        setPasteSuccess(null);
                        try {
                          const { chunksCreated } = await addTextToKnowledge(pasteText.trim(), pasteTitle.trim() || undefined);
                          setPasteSuccess(`${chunksCreated} ${copy.statsEntries.toLowerCase()}`);
                          setPasteText('');
                          setPasteTitle('');
                          getKnowledgeStats().then(setKnowledgeStats).catch(() => {});
                        } catch (err) {
                          const msg =
                            err && typeof err === 'object' && 'error' in err && typeof (err as { error: string }).error === 'string'
                              ? (err as { error: string }).error
                              : err instanceof Error
                                ? err.message
                                : copy.error;
                          setPasteError(msg);
                        } finally {
                          setPasteLoading(false);
                        }
                      }}
                      disabled={pasteLoading || !pasteText.trim()}
                    >
                      {pasteLoading ? '...' : copy.addToBase}
                    </Button>
                  </div>
                  {pasteSuccess && <p className="mt-2 text-sm text-emerald-600">{pasteSuccess}</p>}
                  {pasteError && <p className="mt-2 text-sm text-rose-600">{pasteError}</p>}
                </Card>
                <Card>
                  <p className="text-sm font-medium text-slate-700">{copy.knowledgeBase}</p>
                  <p className="mt-1 text-xs text-slate-500">{copy.uploadHint}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        setUploadFile(f ?? null);
                        setUploadError(null);
                        setUploadSuccess(null);
                      }}
                      disabled={uploadLoading}
                      key={uploadSuccess ?? 'upload'}
                    />
                    <Button
                      type="button"
                      onClick={async () => {
                        if (!uploadFile || uploadLoading) return;
                        setUploadLoading(true);
                        setUploadError(null);
                        setUploadSuccess(null);
                        try {
                          const { chunksCreated } = await uploadKnowledge(uploadFile);
                          setUploadSuccess(`${chunksCreated} ${copy.statsEntries.toLowerCase()}`);
                          setUploadFile(null);
                          getKnowledgeStats().then(setKnowledgeStats).catch(() => {});
                        } catch (err) {
                          const msg =
                            err && typeof err === 'object' && 'error' in err && typeof (err as { error: string }).error === 'string'
                              ? (err as { error: string }).error
                              : err instanceof Error
                                ? err.message
                                : copy.error;
                          setUploadError(msg);
                        } finally {
                          setUploadLoading(false);
                        }
                      }}
                      disabled={!uploadFile || uploadLoading}
                    >
                      {uploadLoading ? '...' : copy.upload}
                    </Button>
                  </div>
                  {uploadSuccess && <p className="mt-2 text-sm text-emerald-600">{uploadSuccess}</p>}
                  {uploadError && <p className="mt-2 text-sm text-rose-600">{uploadError}</p>}
                </Card>
                <Card>
                  <p className="text-sm font-medium text-slate-700">{copy.reindex}</p>
                  <p className="mt-1 text-xs text-slate-500">Re-embed all knowledge chunks</p>
                  <div className="mt-3">
                    <Button
                      type="button"
                      onClick={async () => {
                        if (reindexRunning) return;
                        setReindexRunning(true);
                        setReindexError(null);
                        setReindexProgress(null);
                        try {
                          await reindexKnowledgeStream((p) => setReindexProgress(p));
                        } catch (err) {
                          setReindexError(err instanceof Error ? err.message : copy.error);
                        } finally {
                          setReindexRunning(false);
                        }
                      }}
                      disabled={reindexRunning}
                    >
                      {reindexRunning ? copy.progress : copy.reindex}
                    </Button>
                  </div>
                  {reindexRunning && reindexProgress && (
                    <div className="mt-3">
                      <p className="text-sm text-slate-600">
                        {reindexProgress.processed} / {reindexProgress.total} ({reindexProgress.total > 0 ? Math.round((reindexProgress.processed / reindexProgress.total) * 100) : 0}%)
                      </p>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full bg-[#2AABEE] transition-all duration-300"
                          style={{
                            width: `${reindexProgress.total > 0 ? (reindexProgress.processed / reindexProgress.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {reindexError && <p className="mt-2 text-sm text-rose-600">{reindexError}</p>}
                </Card>
              </>
            )}
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}

function AdminAIPageFallback() {
  return (
    <>
      <AnimatedPage>
        <main className="flex min-h-screen flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title="AI" subtitle="…" />
            <AdminNav />
            <div className="flex gap-2">
              <div className="h-10 w-20 rounded-lg animate-pulse bg-slate-200" />
              <div className="h-10 w-20 rounded-lg animate-pulse bg-slate-200" />
            </div>
            <Card>
              <p className="text-sm text-slate-500">Загрузка…</p>
            </Card>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}

export default function AdminAIPage() {
  return (
    <Suspense fallback={<AdminAIPageFallback />}>
      <AdminAIPageContent />
    </Suspense>
  );
}
