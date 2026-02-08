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

type ImportTab = 'test' | 'oral';

interface OralDirectionPreview {
  name: string;
  language: string;
  categories: { categoryLabel: string; questionCount: number }[];
}

export default function AdminImportPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [tab, setTab] = useState<ImportTab>('test');

  // Test import state
  const [fileName, setFileName] = useState('');
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [profession, setProfession] = useState<'DOCTOR' | 'NURSE' | ''>('');
  const [importMode, setImportMode] = useState<'overwrite' | 'add'>('overwrite');
  const [preview, setPreview] = useState<
    {
      name: string;
      language: string;
      questionCount: number;
      validQuestionCount?: number;
      errors?: { row: number; reason: string }[];
    }[]
  >([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [statusBar, setStatusBar] = useState<'idle' | 'preview' | 'import' | 'done'>('idle');

  // Oral import state
  const [oralFileName, setOralFileName] = useState('');
  const [oralFileBase64, setOralFileBase64] = useState<string | null>(null);
  const [oralProfession, setOralProfession] = useState<'DOCTOR' | 'NURSE' | ''>('');
  const [oralImportMode, setOralImportMode] = useState<'overwrite' | 'add'>('overwrite');
  const [oralPreview, setOralPreview] = useState<OralDirectionPreview[]>([]);
  const [oralPreviewLoading, setOralPreviewLoading] = useState(false);
  const [oralImportLoading, setOralImportLoading] = useState(false);
  const [oralErrorMessage, setOralErrorMessage] = useState<string | null>(null);
  const [oralStatusBar, setOralStatusBar] = useState<'idle' | 'preview' | 'import' | 'done'>('idle');

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Import',
        subtitle: 'Upload XLSX: tests or oral questions.',
        tabTests: 'Tests',
        tabOral: 'Oral',
        choose: 'Choose file',
        run: 'Run import',
        note: 'Validation and import report will appear here.',
        doctor: 'Doctors',
        nurse: 'Nurses',
        preview: 'Preview directions',
        import: 'Import',
        selectProfession: 'Select profession',
        noPreview: 'No directions detected.',
        statusIdle: 'Ready to import',
        statusPreview: 'Checking file… (large files may take up to 2 min)',
        statusImport: 'Importing… Please wait.',
        statusDone: 'Import completed.',
        importModeLabel: 'Import mode',
        modeOverwrite: 'Overwrite',
        modeAdd: 'Add',
        modeOverwriteHint: 'Replace existing exams and questions (AI explanations will be lost).',
        modeAddHint: 'Add only new directions; existing ones are left unchanged.',
        oralSubtitle: 'First sheet = UZ, second = RU, third = UZ, fourth = RU, … Columns = categories (3, 2, 1, высшая for doctors; 2, 1, высшая for nurses). Each row = one question per column.',
        oralNoPreview: 'No directions in file.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Import',
        subtitle: 'XLSX yuklang: testlar yoki og\'zaki savollar.',
        tabTests: 'Testlar',
        tabOral: 'Og\'zaki',
        choose: 'Fayl tanlash',
        run: 'Importni boshlash',
        note: 'Validatsiya va hisobot shu yerda chiqadi.',
        doctor: 'Shifokorlar',
        nurse: 'Hamshiralar',
        preview: 'Yo‘nalishlarni tekshirish',
        import: 'Import qilish',
        selectProfession: 'Kasbni tanlang',
        noPreview: 'Yo‘nalishlar topilmadi.',
        statusIdle: 'Importga tayyor',
        statusPreview: 'Fayl tekshirilmoqda…',
        statusImport: 'Import qilinmoqda… Kuting.',
        statusDone: 'Import tugadi.',
        importModeLabel: 'Import rejimi',
        modeOverwrite: 'Ustiga yozish',
        modeAdd: "Qo'shish",
        modeOverwriteHint: 'Mavjud imtihonlar va savollar almashtiriladi.',
        modeAddHint: "Faqat yangi yo‘nalishlar qo‘shiladi.",
        oralSubtitle: 'Birinchi varaq = UZ, ikkinchi = RU, uchinchi = UZ, … Ustunlar = kategoriyalar. Har qator = bitta savol.',
        oralNoPreview: 'Faylda yo‘nalishlar yo‘q.',
      };
    }
    return {
      title: 'Импорт',
      subtitle: 'Загрузите XLSX: тесты или устные вопросы.',
      tabTests: 'Тесты',
      tabOral: 'Устные',
      choose: 'Выбрать файл',
      run: 'Запустить импорт',
      note: 'Отчет по валидации и импорту появится здесь.',
      doctor: 'Врачи',
      nurse: 'Медсёстры',
      preview: 'Проверить направления',
      import: 'Импортировать',
      selectProfession: 'Выберите профессию',
      noPreview: 'Направления не найдены.',
      statusIdle: 'Готов к импорту',
      statusPreview: 'Проверка файла… (крупный файл — до 2 мин)',
      statusImport: 'Импорт… Подождите.',
      statusDone: 'Импорт завершён.',
      importModeLabel: 'Режим импорта',
      modeOverwrite: 'Перезаписать',
      modeAdd: 'Добавить',
      modeOverwriteHint: 'Заменить существующие экзамены и вопросы (ответы Зиёды будут потеряны).',
      modeAddHint: 'Добавить только новые направления; существующие не трогать.',
      oralSubtitle: 'Первый лист = УЗ, второй = RU, третий = УЗ, четвёртый = RU, … Колонки = категории (врачи: 3, 2, 1, высшая; медсёстры: 2, 1, высшая). Строка = один вопрос на колонку.',
      oralNoPreview: 'В файле направлений нет.',
    };
  }, [language]);

  function handleFileChange(file?: File | null) {
    if (!file) {
      setFileName('');
      setFileBase64(null);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileBase64(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  function handleOralFileChange(file?: File | null) {
    if (!file) {
      setOralFileName('');
      setOralFileBase64(null);
      return;
    }
    setOralFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setOralFileBase64(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  async function handlePreview() {
    if (!fileBase64 || !profession) return;
    setPreviewLoading(true);
    setErrorMessage(null);
    setStatusBar('preview');
    try {
      const { response, data } = await apiFetch('/admin/import/preview', {
        method: 'POST',
        json: { profession, fileBase64 },
        timeoutMs: 120_000,
      });
      if (!response.ok) {
        setErrorMessage('Import preview failed.');
        return;
      }
      const payload = data as {
        preview?: { directions?: { name: string; language: string; questionCount: number }[] };
      } | null;
      setPreview(payload?.preview?.directions ?? []);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Preview request failed.');
    } finally {
      setPreviewLoading(false);
      setStatusBar('idle');
    }
  }

  async function handleImport() {
    if (!fileBase64 || !profession) return;
    setImportLoading(true);
    setErrorMessage(null);
    setImportWarnings([]);
    setStatusBar('import');
    try {
      const { response, data } = await apiFetch('/admin/import/execute', {
        method: 'POST',
        json: { profession, fileBase64, mode: importMode },
        timeoutMs: 300_000,
      });
      if (!response.ok) {
        const errDetail = typeof (data as { error?: string })?.error === 'string' ? (data as { error: string }).error : '';
        setErrorMessage(errDetail ? `Import failed: ${errDetail}` : 'Import failed.');
        return;
      }
      const result = (data as { result?: { warnings?: string[] } })?.result;
      if (Array.isArray(result?.warnings) && result.warnings.length > 0) {
        setImportWarnings(result.warnings);
      }
      setStatusBar('done');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Import request failed.');
      setStatusBar('idle');
    } finally {
      setImportLoading(false);
    }
  }

  async function handleOralPreview() {
    if (!oralFileBase64 || !oralProfession) return;
    setOralPreviewLoading(true);
    setOralErrorMessage(null);
    setOralStatusBar('preview');
    try {
      const { response, data } = await apiFetch('/admin/import/preview-oral', {
        method: 'POST',
        json: { profession: oralProfession, fileBase64: oralFileBase64 },
        timeoutMs: 120_000,
      });
      if (!response.ok) {
        setOralErrorMessage('Preview failed.');
        return;
      }
      const payload = data as { preview?: { directions?: OralDirectionPreview[] } } | null;
      setOralPreview(payload?.preview?.directions ?? []);
    } catch (e) {
      setOralErrorMessage(e instanceof Error ? e.message : 'Preview failed.');
    } finally {
      setOralPreviewLoading(false);
      setOralStatusBar('idle');
    }
  }

  async function handleOralImport() {
    if (!oralFileBase64 || !oralProfession) return;
    setOralImportLoading(true);
    setOralErrorMessage(null);
    setOralStatusBar('import');
    try {
      const { response, data } = await apiFetch('/admin/import/execute-oral', {
        method: 'POST',
        json: { profession: oralProfession, fileBase64: oralFileBase64, mode: oralImportMode },
        timeoutMs: 300_000,
      });
      if (!response.ok) {
        const errDetail = typeof (data as { error?: string })?.error === 'string' ? (data as { error: string }).error : '';
        setOralErrorMessage(errDetail || 'Import failed.');
        return;
      }
      setOralStatusBar('done');
    } catch (e) {
      setOralErrorMessage(e instanceof Error ? e.message : 'Import failed.');
      setOralStatusBar('idle');
    } finally {
      setOralImportLoading(false);
    }
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
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
            </div>

            {tab === 'test' && (
              <>
                <Card title={copy.tabTests} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="md"
                      variant={profession === 'DOCTOR' ? 'primary' : 'secondary'}
                      onClick={() => setProfession('DOCTOR')}
                    >
                      {copy.doctor}
                    </Button>
                    <Button
                      size="md"
                      variant={profession === 'NURSE' ? 'primary' : 'secondary'}
                      onClick={() => setProfession('NURSE')}
                    >
                      {copy.nurse}
                    </Button>
                  </div>
                  {!profession ? (
                    <p className="text-xs text-slate-500">{copy.selectProfession}</p>
                  ) : null}
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">{copy.importModeLabel}</p>
                    <div className="flex flex-col gap-2">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'overwrite'}
                          onChange={() => setImportMode('overwrite')}
                          className="mt-1"
                        />
                        <span className="text-sm">
                          <strong>{copy.modeOverwrite}</strong> — {copy.modeOverwriteHint}
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'add'}
                          onChange={() => setImportMode('add')}
                          className="mt-1"
                        />
                        <span className="text-sm">
                          <strong>{copy.modeAdd}</strong> — {copy.modeAddHint}
                        </span>
                      </label>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                    className="text-sm text-slate-600"
                  />
                  {fileName ? <p className="text-sm text-slate-600">{fileName}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="lg"
                      variant="secondary"
                      onClick={handlePreview}
                      disabled={!fileBase64 || !profession || previewLoading}
                    >
                      {copy.preview}
                    </Button>
                    <Button
                      size="lg"
                      onClick={handleImport}
                      disabled={!fileBase64 || !profession || importLoading}
                    >
                      {copy.import}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">{copy.note}</p>
                  {errorMessage ? (
                    <p className="text-xs text-rose-500">{errorMessage}</p>
                  ) : null}
                  <div
                    className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                    role="status"
                    aria-live="polite"
                  >
                    {(statusBar === 'preview' || statusBar === 'import') && (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" aria-hidden />
                    )}
                    {statusBar === 'idle' && copy.statusIdle}
                    {statusBar === 'preview' && copy.statusPreview}
                    {statusBar === 'import' && copy.statusImport}
                    {statusBar === 'done' && copy.statusDone}
                  </div>
                  {statusBar === 'done' && importWarnings.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <p className="font-medium">Предупреждения при импорте:</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                        {importWarnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Card>

                <Card title={copy.preview}>
                  {previewLoading ? (
                    <p className="text-sm text-slate-600">{copy.note}</p>
                  ) : preview.length === 0 ? (
                    <p className="text-sm text-slate-600">{copy.noPreview}</p>
                  ) : (
                    <div className="flex flex-col gap-2 text-sm text-slate-700">
                      {preview.map((item) => {
                        const valid = item.validQuestionCount ?? item.questionCount;
                        const noValid = valid === 0 && item.questionCount > 0;
                        const hasErrors = (item.errors?.length ?? 0) > 0;
                        return (
                          <div
                            key={`${item.name}-${item.language}`}
                            className={`rounded-lg border px-3 py-2 ${noValid ? 'border-amber-200 bg-amber-50' : hasErrors ? 'border-amber-100 bg-amber-50/50' : 'border-transparent'}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{item.name}</span>
                              <span className={`text-xs ${noValid ? 'text-amber-700' : 'text-slate-500'}`}>
                                {item.language} · {item.validQuestionCount !== undefined
                                  ? `распознано ${item.validQuestionCount} из ${item.questionCount}`
                                  : item.questionCount}
                              </span>
                            </div>
                            {hasErrors && item.errors && (
                              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-amber-800">
                                {item.errors.map((e) => (
                                  <li key={e.row}>
                                    Строка {e.row}: {e.reason}
                                  </li>
                                ))}
                                {(item.errors?.length ?? 0) === 25 && (
                                  <li className="text-amber-600">… возможны ещё ошибки (показаны первые 25)</li>
                                )}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </>
            )}

            {tab === 'oral' && (
              <>
                <Card title={copy.tabOral} className="space-y-4">
                  <p className="text-xs text-slate-600">{copy.oralSubtitle}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="md"
                      variant={oralProfession === 'DOCTOR' ? 'primary' : 'secondary'}
                      onClick={() => setOralProfession('DOCTOR')}
                    >
                      {copy.doctor}
                    </Button>
                    <Button
                      size="md"
                      variant={oralProfession === 'NURSE' ? 'primary' : 'secondary'}
                      onClick={() => setOralProfession('NURSE')}
                    >
                      {copy.nurse}
                    </Button>
                  </div>
                  {!oralProfession ? (
                    <p className="text-xs text-slate-500">{copy.selectProfession}</p>
                  ) : null}
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">{copy.importModeLabel}</p>
                    <div className="flex flex-col gap-2">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="radio"
                          name="oralImportMode"
                          checked={oralImportMode === 'overwrite'}
                          onChange={() => setOralImportMode('overwrite')}
                          className="mt-1"
                        />
                        <span className="text-sm">
                          <strong>{copy.modeOverwrite}</strong> — {copy.modeOverwriteHint}
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="radio"
                          name="oralImportMode"
                          checked={oralImportMode === 'add'}
                          onChange={() => setOralImportMode('add')}
                          className="mt-1"
                        />
                        <span className="text-sm">
                          <strong>{copy.modeAdd}</strong> — {copy.modeAddHint}
                        </span>
                      </label>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => handleOralFileChange(e.target.files?.[0] ?? null)}
                    className="text-sm text-slate-600"
                  />
                  {oralFileName ? (
                    <p className="text-sm text-slate-600">{oralFileName}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="lg"
                      variant="secondary"
                      onClick={handleOralPreview}
                      disabled={!oralFileBase64 || !oralProfession || oralPreviewLoading}
                    >
                      {copy.preview}
                    </Button>
                    <Button
                      size="lg"
                      onClick={handleOralImport}
                      disabled={!oralFileBase64 || !oralProfession || oralImportLoading}
                    >
                      {copy.import}
                    </Button>
                  </div>
                  {oralErrorMessage ? (
                    <p className="text-xs text-rose-500">{oralErrorMessage}</p>
                  ) : null}
                  <div
                    className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                    role="status"
                    aria-live="polite"
                  >
                    {(oralStatusBar === 'preview' || oralStatusBar === 'import') && (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" aria-hidden />
                    )}
                    {oralStatusBar === 'idle' && copy.statusIdle}
                    {oralStatusBar === 'preview' && copy.statusPreview}
                    {oralStatusBar === 'import' && copy.statusImport}
                    {oralStatusBar === 'done' && copy.statusDone}
                  </div>
                </Card>

                <Card title={copy.preview}>
                  {oralPreviewLoading ? (
                    <p className="text-sm text-slate-600">{copy.note}</p>
                  ) : oralPreview.length === 0 ? (
                    <p className="text-sm text-slate-600">{copy.oralNoPreview}</p>
                  ) : (
                    <div className="flex flex-col gap-3 text-sm text-slate-700">
                      {oralPreview.map((dir, i) => (
                        <div
                          key={`${dir.name}-${dir.language}-${i}`}
                          className="rounded-lg border border-slate-200 bg-slate-50/50 p-3"
                        >
                          <p className="mb-2 font-medium">
                            {dir.name}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              {dir.language}
                            </span>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {dir.categories.map((c) => (
                              <span
                                key={c.categoryLabel}
                                className="rounded bg-slate-200 px-2 py-0.5 text-xs"
                              >
                                {c.categoryLabel}: {c.questionCount}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
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
