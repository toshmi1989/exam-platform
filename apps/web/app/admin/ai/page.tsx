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
  getKnowledgeFiles,
  deleteKnowledgeBySource,
  getZiyodaPrompts,
  updateZiyodaPrompts,
  addTextToKnowledge,
  uploadKnowledge,
  reindexKnowledgeStream,
  clearZiyodaBotCache,
  getUnansweredQuestions,
  updateUnansweredQuestionTopic,
  deleteUnansweredQuestion,
  type AdminAiStats,
  type AdminOralStats,
  type PrewarmProgress,
  type OralPrewarmProgress,
  type KnowledgeStats,
  type KnowledgeFileItem,
  type ReindexProgress,
  type ZiyodaPrompts,
  type UnansweredQuestionItem,
} from '../../../lib/api';
import { API_BASE_URL } from '../../../lib/api/config';
import { readTelegramUser } from '../../../lib/telegramUser';

type AiTab = 'test' | 'oral' | 'ziyoda';
type ExamOption = { id: string; title: string; type?: string; category?: string };

/** Промпты Зиёды по умолчанию (уже в полях, можно только править). */
const DEFAULT_ZIYODA_PROMPTS: ZiyodaPrompts = {
  system_instruction:
    `Ты — Зиёда, виртуальный помощник медицинской платформы ZiyoMed.

Твоя задача: помогать пользователям разбираться в экзаменах, аттестации и работе платформы; отвечать ТОЛЬКО на основе переданного контекста в <chunks>; если информации нет — честно сказать; если вопрос неясный — задать уточняющий вопрос.

СТРОГО ЗАПРЕЩЕНО: выдумывать факты; использовать знания вне контекста; отвечать абстрактно; писать длинные эссе.

Если в контексте нет ответа, говори точно: {fallback}

Правила: (1) Язык ответа совпадает с языком вопроса ({lang}). (2) Формат: короткий абзац, затем пункты при необходимости. Пример: 🧠 Кратко • ... 📘 Детали • ... (3) Если вопрос слишком общий — не отвечай сразу, задай уточнение (например: «Вы про устный экзамен или тестирование?»). (4) При нескольких трактовках — предложи варианты. (5) Вопросы о платформе — только из контекста; об аттестации — только из нормативных документов в контексте.

Максимум 8 предложений. Без воды, без философии, без повтора вопроса. Учитывай предыдущий обмен (медсёстры = hamshira, врачи = shifokor). Ты — практичный медицинский консультант.`,
  fallback_ru: 'В базе Зиёды нет этой информации. Можешь уточнить вопрос?',
  fallback_uz: "Ziyoda bazasida bu haqda ma'lumot yo'q. Iltimos, savolni aniqlashtiring.",
  unavailable_ru: 'Зиёда временно недоступна. Попробуйте позже.',
  unavailable_uz: "Ziyoda vaqtincha mavjud emas. Keyinroq urunib ko'ring.",
  empty_kb_ru: 'База знаний ZiyoMed пока пуста. Обратитесь к администратору для загрузки материалов.',
  empty_kb_uz: "ZiyoMed bilim bazasi hali bo'sh. Materiallarni yuklash uchun administratorga murojaat qiling.",
  max_chunks: '10',
  max_context_chars: '6000',
  max_context_msg_len: '500',
  min_similarity: '0.15',
};

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
  const [clearCacheLoading, setClearCacheLoading] = useState(false);
  const [clearCacheResult, setClearCacheResult] = useState<number | null>(null);
  const [clearCacheError, setClearCacheError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFileItem[]>([]);
  const [fileDeletingSource, setFileDeletingSource] = useState<string | null>(null);
  const [ziyodaPrompts, setZiyodaPrompts] = useState<ZiyodaPrompts>(() => ({ ...DEFAULT_ZIYODA_PROMPTS }));
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [promptsSaving, setPromptsSaving] = useState(false);
  const [promptsError, setPromptsError] = useState<string | null>(null);
  const [promptsSuccess, setPromptsSuccess] = useState<string | null>(null);
  const [unansweredItems, setUnansweredItems] = useState<UnansweredQuestionItem[]>([]);
  const [unansweredTopics, setUnansweredTopics] = useState<string[]>([]);
  const [unansweredTopicFilter, setUnansweredTopicFilter] = useState<string>('');

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
      getKnowledgeFiles().then(setKnowledgeFiles).catch(() => setKnowledgeFiles([]));
      setPromptsLoading(true);
      getZiyodaPrompts()
        .then((data) => setZiyodaPrompts({ ...DEFAULT_ZIYODA_PROMPTS, ...data }))
        .catch(() => setZiyodaPrompts({ ...DEFAULT_ZIYODA_PROMPTS }))
        .finally(() => setPromptsLoading(false));
      getUnansweredQuestions()
        .then(({ items, topics }) => {
          setUnansweredItems(items);
          setUnansweredTopics(topics);
        })
        .catch(() => {
          setUnansweredItems([]);
          setUnansweredTopics([]);
        });
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
        filesLabel: 'Files',
        statsCache: 'Cached answers',
        pasteLabel: 'Paste text',
        pastePlaceholder: 'Paste rules, FAQs, or any text here…',
        pasteTitleLabel: 'Title (optional)',
        addToBase: 'Add to knowledge base',
        loadedMaterials: 'Loaded materials',
        deleteEntry: 'Delete',
        promptsTitle: 'Ziyoda prompts',
        promptsHint: 'Use {lang} (ru/uz), {fallback} (when no answer in context).',
        systemInstructionLabel: 'System instruction (how to answer)',
        fallbackRuLabel: 'Fallback (RU) — when answer not in context',
        fallbackUzLabel: 'Fallback (UZ)',
        unavailableRuLabel: 'Unavailable (RU)',
        unavailableUzLabel: 'Unavailable (UZ)',
        emptyKbRuLabel: 'Empty knowledge base (RU)',
        emptyKbUzLabel: 'Empty knowledge base (UZ)',
        maxChunksLabel: 'Max chunks (context)',
        maxContextCharsLabel: 'Max context chars',
        maxContextMsgLenLabel: 'Max context msg len',
        minSimilarityLabel: 'Min similarity (0–1)',
        minSimilarityHint: 'Chunks below this relevance are skipped. Lower = more chunks, higher = stricter.',
        savePrompts: 'Save prompts',
        promptsNarrowHint: 'If the bot often says "not in materials": raise "Max chunks" and "Max context chars", lower "Min similarity" (e.g. 0.2), or run Reindex. Response style in system instruction.',
        clearCacheLabel: 'Clear Ziyoda answer cache',
        clearCacheDone: 'Cleared',
        unansweredTitle: 'Unanswered questions',
        unansweredHint: 'Questions the bot could not answer. Assign a topic, then add the answer to the knowledge base above.',
        filterByTopic: 'By topic',
        noTopic: '— no topic —',
        setTopic: 'Topic',
        removeAfterAdded: 'Remove after adding to base',
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
        filesLabel: 'Fayllar',
        statsCache: 'Kesh javoblar',
        pasteLabel: "Matn qo'shish",
        pastePlaceholder: "Qoidalar, savol-javoblar yoki istalgan matnni shu yerga joylashtiring…",
        pasteTitleLabel: 'Sarlavha (ixtiyoriy)',
        addToBase: "Bilimlar bazasiga qo'shish",
        loadedMaterials: "Yuklangan materiallar",
        deleteEntry: "O'chirish",
        promptsTitle: "Ziyoda promptlari",
        promptsHint: "{lang} — til, {fallback} — zaxira ibora.",
        systemInstructionLabel: "Tizim ko'rsatmasi (qanday javob berish)",
        fallbackRuLabel: "Fallback (RU)",
        fallbackUzLabel: "Fallback (UZ)",
        unavailableRuLabel: "Mavjud emas (RU)",
        unavailableUzLabel: "Mavjud emas (UZ)",
        emptyKbRuLabel: "Bo'sh baza (RU)",
        emptyKbUzLabel: "Bo'sh baza (UZ)",
        maxChunksLabel: 'Maks bloklar',
        maxContextCharsLabel: 'Maks kontekst belgilari',
        maxContextMsgLenLabel: 'Maks xabar uzunligi',
        minSimilarityLabel: 'Min o\'xshashlik (0–1)',
        minSimilarityHint: 'Shundan past bo\'lgan bloklar o\'tkazib yuboriladi.',
        savePrompts: "Promptlarni saqlash",
        promptsNarrowHint: "Bot tez-tez \"materialda yo\'q\" desa: Maks bloklar va kontekstni oshiring, Min o\'xshashlikni kamaytiring (0.2) yoki Qayta indekslashni ishlating.",
        clearCacheLabel: "Ziyoda javob keshini tozalash",
        clearCacheDone: "Tozalandi",
        unansweredTitle: "Javob topilmagan savollar",
        unansweredHint: "Bot javob topolmagan savollar. Mavzuga qo‘shing, keyin bazaga javob qo‘shing.",
        filterByTopic: "Mavzu bo‘yicha",
        noTopic: "— mavzu yo‘q —",
        setTopic: "Mavzu",
        removeAfterAdded: "Bazaga qo‘shilgach o‘chirish",
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
      filesLabel: 'Файлов',
      statsCache: 'Кэш ответов',
      pasteLabel: 'Вставить текст',
      pastePlaceholder: 'Вставьте сюда правила, ответы на вопросы или любой текст…',
      pasteTitleLabel: 'Название (необязательно)',
      addToBase: 'Добавить в базу знаний',
      loadedMaterials: 'Загруженные материалы',
      deleteEntry: 'Удалить',
      promptsTitle: 'Промпты Зиёды',
      promptsHint: 'Подставки: {lang} — язык (ru/uz), {fallback} — фраза при отсутствии ответа.',
      systemInstructionLabel: 'Системная инструкция (как отвечать)',
      fallbackRuLabel: 'Фраза при отсутствии в контексте (RU)',
      fallbackUzLabel: 'Фраза при отсутствии в контексте (UZ)',
      unavailableRuLabel: 'Временно недоступна (RU)',
      unavailableUzLabel: 'Временно недоступна (UZ)',
      emptyKbRuLabel: 'Пустая база знаний (RU)',
      emptyKbUzLabel: 'Пустая база знаний (UZ)',
      maxChunksLabel: 'Макс. чанков (контекст)',
      maxContextCharsLabel: 'Макс. символов контекста',
      maxContextMsgLenLabel: 'Макс. длина сообщения в контексте',
      minSimilarityLabel: 'Мин. релевантность (0–1)',
      minSimilarityHint: 'Фрагменты с релевантностью ниже не передаются в модель. Ниже значение — больше чанков.',
      savePrompts: 'Сохранить промпты',
      promptsNarrowHint: 'Если бот часто пишет «в материалах не указано»: увеличьте «Макс. чанков» и «Макс. символов контекста», уменьшите «Мин. релевантность» (например 0,2) или запустите «Переиндексация».',
      clearCacheLabel: 'Очистить кэш ответов Зиёды',
      clearCacheDone: 'Очищено',
      unansweredTitle: 'Неотвеченные вопросы',
      unansweredHint: 'Вопросы, на которые бот не нашёл ответ. Назначьте тему, затем добавьте ответ в базу знаний выше.',
      filterByTopic: 'По теме',
      noTopic: '— без темы —',
      setTopic: 'Тема',
      removeAfterAdded: 'Удалить после добавления в базу',
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
                  <p className="text-sm font-medium text-slate-700">{copy.loadedMaterials}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {copy.filesLabel}: {knowledgeFiles.length}. {copy.uploadHint}
                  </p>
                  {knowledgeFiles.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">{copy.pastePlaceholder}</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {knowledgeFiles.map((file) => (
                        <li
                          key={file.source}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate font-medium text-slate-800" title={file.name}>
                            {file.name}
                          </span>
                          <span className="shrink-0 text-xs text-slate-500">
                            {file.chunkCount} {copy.statsEntries.toLowerCase()}, {new Date(file.createdAt).toLocaleDateString()}
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={fileDeletingSource === file.source}
                            onClick={async () => {
                              if (fileDeletingSource) return;
                              setFileDeletingSource(file.source);
                              try {
                                await deleteKnowledgeBySource(file.source);
                                setKnowledgeFiles((prev) => prev.filter((f) => f.source !== file.source));
                                getKnowledgeStats().then(setKnowledgeStats).catch(() => {});
                              } catch {
                                // ignore
                              } finally {
                                setFileDeletingSource(null);
                              }
                            }}
                          >
                            {fileDeletingSource === file.source ? '…' : copy.deleteEntry}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
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
                          getKnowledgeFiles().then(setKnowledgeFiles).catch(() => {});
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
                  <p className="text-sm font-medium text-slate-700">{copy.unansweredTitle}</p>
                  <p className="mt-1 text-xs text-slate-500">{copy.unansweredHint}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="text-xs text-slate-500">{copy.filterByTopic}:</label>
                    <select
                      value={unansweredTopicFilter}
                      onChange={(e) => {
                        setUnansweredTopicFilter(e.target.value);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
                    >
                      <option value="">{copy.noTopic}</option>
                      {unansweredTopics.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const filtered =
                      unansweredTopicFilter === ''
                        ? unansweredItems
                        : unansweredItems.filter((i) => i.topic === unansweredTopicFilter);
                    const grouped = new Map<string, UnansweredQuestionItem[]>();
                    for (const item of filtered) {
                      const key = item.topic ?? copy.noTopic;
                      if (!grouped.has(key)) grouped.set(key, []);
                      grouped.get(key)!.push(item);
                    }
                    const order = [copy.noTopic, ...unansweredTopics.filter((t) => unansweredTopicFilter === '' || t === unansweredTopicFilter)];
                    if (filtered.length === 0) {
                      return (
                        <p className="mt-3 text-sm text-slate-500">
                          {unansweredItems.length === 0
                            ? 'Нет записей. Вопросы появятся, когда пользователи спросят то, на что бот не нашёл ответ.'
                            : 'По выбранной теме записей нет.'}
                        </p>
                      );
                    }
                    return (
                      <ul className="mt-3 space-y-4">
                        {order.map((topicKey) => {
                          const list = grouped.get(topicKey);
                          if (!list?.length) return null;
                          return (
                            <li key={topicKey}>
                              <p className="mb-1 text-xs font-medium text-slate-500">{topicKey}</p>
                              <ul className="space-y-2">
                                {list.map((item) => (
                                  <li
                                    key={item.id}
                                    className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm"
                                  >
                                    <p className="text-slate-800">{item.questionText}</p>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-xs text-slate-500">
                                        {new Date(item.createdAt).toLocaleString()}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <select
                                          value={item.topic ?? ''}
                                          onChange={async (e) => {
                                            const v = e.target.value;
                                            try {
                                              await updateUnansweredQuestionTopic(item.id, v || null);
                                              const { items, topics } = await getUnansweredQuestions();
                                              setUnansweredItems(items);
                                              setUnansweredTopics(topics);
                                            } catch {
                                              // ignore
                                            }
                                          }}
                                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                                        >
                                          <option value="">{copy.noTopic}</option>
                                          {['Сертификат', 'Подписка и оплата', 'Регистрация и вход', 'Устный экзамен', 'Тестовый экзамен', 'Профиль', 'Другое'].map((t) => (
                                            <option key={t} value={t}>
                                              {t}
                                            </option>
                                          ))}
                                        </select>
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          size="md"
                                          onClick={async () => {
                                            try {
                                              await deleteUnansweredQuestion(item.id);
                                              setUnansweredItems((prev) => prev.filter((x) => x.id !== item.id));
                                              getUnansweredQuestions().then(({ topics }) => setUnansweredTopics(topics)).catch(() => {});
                                            } catch {
                                              // ignore
                                            }
                                          }}
                                        >
                                          {copy.removeAfterAdded}
                                        </Button>
                                      </div>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()}
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
                          getKnowledgeFiles().then(setKnowledgeFiles).catch(() => {});
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
                <Card>
                  <p className="text-sm font-medium text-slate-700">{copy.clearCacheLabel}</p>
                  <p className="mt-1 text-xs text-slate-500">После смены промптов или базы — чтобы бот не подставлял старые ответы</p>
                  <div className="mt-3">
                    <Button
                      type="button"
                      disabled={clearCacheLoading}
                      onClick={async () => {
                        setClearCacheLoading(true);
                        setClearCacheError(null);
                        setClearCacheResult(null);
                        try {
                          const { cleared } = await clearZiyodaBotCache();
                          setClearCacheResult(cleared);
                          getKnowledgeStats().then(setKnowledgeStats).catch(() => {});
                        } catch (err) {
                          setClearCacheError(err instanceof Error ? err.message : copy.error);
                        } finally {
                          setClearCacheLoading(false);
                        }
                      }}
                    >
                      {clearCacheLoading ? '…' : copy.clearCacheLabel}
                    </Button>
                  </div>
                  {clearCacheResult !== null && (
                    <p className="mt-2 text-sm text-emerald-600">{copy.clearCacheDone}: {clearCacheResult}</p>
                  )}
                  {clearCacheError && <p className="mt-2 text-sm text-rose-600">{clearCacheError}</p>}
                </Card>
                <Card>
                  <p className="text-sm font-medium text-slate-700">{copy.promptsTitle}</p>
                  <p className="mt-1 text-xs text-slate-500">{copy.promptsHint}</p>
                  <p className="mt-2 text-xs text-slate-500 italic">{copy.promptsNarrowHint}</p>
                  {promptsLoading ? (
                    <p className="mt-3 text-sm text-slate-500">Загрузка…</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.systemInstructionLabel}</label>
                        <textarea
                          value={ziyodaPrompts.system_instruction ?? DEFAULT_ZIYODA_PROMPTS.system_instruction}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, system_instruction: e.target.value }))}
                          rows={4}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          placeholder="Ziyoda, ассистент ZiyoMed…"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.fallbackRuLabel}</label>
                        <input
                          type="text"
                          value={ziyodaPrompts.fallback_ru ?? DEFAULT_ZIYODA_PROMPTS.fallback_ru}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, fallback_ru: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.fallbackUzLabel}</label>
                        <input
                          type="text"
                          value={ziyodaPrompts.fallback_uz ?? DEFAULT_ZIYODA_PROMPTS.fallback_uz}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, fallback_uz: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.unavailableRuLabel}</label>
                        <input
                          type="text"
                          value={ziyodaPrompts.unavailable_ru ?? DEFAULT_ZIYODA_PROMPTS.unavailable_ru}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, unavailable_ru: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.unavailableUzLabel}</label>
                        <input
                          type="text"
                          value={ziyodaPrompts.unavailable_uz ?? DEFAULT_ZIYODA_PROMPTS.unavailable_uz}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, unavailable_uz: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.emptyKbRuLabel}</label>
                        <input
                          type="text"
                          value={ziyodaPrompts.empty_kb_ru ?? DEFAULT_ZIYODA_PROMPTS.empty_kb_ru}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, empty_kb_ru: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.emptyKbUzLabel}</label>
                        <input
                          type="text"
                          value={ziyodaPrompts.empty_kb_uz ?? DEFAULT_ZIYODA_PROMPTS.empty_kb_uz}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, empty_kb_uz: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.maxChunksLabel}</label>
                        <input
                          type="number"
                          min={1}
                          value={ziyodaPrompts.max_chunks ?? DEFAULT_ZIYODA_PROMPTS.max_chunks}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, max_chunks: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.maxContextCharsLabel}</label>
                        <input
                          type="number"
                          min={500}
                          value={ziyodaPrompts.max_context_chars ?? DEFAULT_ZIYODA_PROMPTS.max_context_chars}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, max_context_chars: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.maxContextMsgLenLabel}</label>
                        <input
                          type="number"
                          min={100}
                          value={ziyodaPrompts.max_context_msg_len ?? DEFAULT_ZIYODA_PROMPTS.max_context_msg_len}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, max_context_msg_len: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">{copy.minSimilarityLabel}</label>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={ziyodaPrompts.min_similarity ?? DEFAULT_ZIYODA_PROMPTS.min_similarity}
                          onChange={(e) => setZiyodaPrompts((p) => ({ ...p, min_similarity: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                        <p className="mt-1 text-xs text-slate-500">{copy.minSimilarityHint}</p>
                      </div>
                      <Button
                        type="button"
                        disabled={promptsSaving}
                        onClick={async () => {
                          setPromptsSaving(true);
                          setPromptsError(null);
                          setPromptsSuccess(null);
                          try {
                            await updateZiyodaPrompts(ziyodaPrompts);
                            setPromptsSuccess('Сохранено');
                            setTimeout(() => setPromptsSuccess(null), 3000);
                          } catch (err) {
                            setPromptsError(err instanceof Error ? err.message : copy.error);
                          } finally {
                            setPromptsSaving(false);
                          }
                        }}
                      >
                        {promptsSaving ? '…' : copy.savePrompts}
                      </Button>
                      {promptsSuccess && <p className="text-sm text-emerald-600">{promptsSuccess}</p>}
                      {promptsError && <p className="text-sm text-rose-600">{promptsError}</p>}
                    </div>
                  )}
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
