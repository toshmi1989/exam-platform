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

export default function AdminImportPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [fileName, setFileName] = useState('');
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [profession, setProfession] = useState<'DOCTOR' | 'NURSE' | ''>('');
  const [preview, setPreview] = useState<
    { name: string; language: string; questionCount: number }[]
  >([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusBar, setStatusBar] = useState<'idle' | 'preview' | 'import' | 'done'>('idle');

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Import',
        subtitle: 'Upload XLSX with exams and questions.',
        choose: 'Choose file',
        run: 'Run import',
        note: 'Validation and import report will appear here.',
        doctor: 'Doctors bank',
        nurse: 'Nurses bank',
        preview: 'Preview directions',
        import: 'Import',
        selectProfession: 'Select profession',
        noPreview: 'No directions detected.',
        statusIdle: 'Ready to import',
        statusPreview: 'Checking file… (large files may take up to 2 min)',
        statusImport: 'Importing directions… Please wait.',
        statusDone: 'Import completed.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Import',
        subtitle: 'Imtihon va savollar uchun XLSX yuklang.',
        choose: 'Fayl tanlash',
        run: 'Importni boshlash',
        note: 'Validatsiya va hisobot shu yerda chiqadi.',
        doctor: 'Shifokorlar bazasi',
        nurse: 'Hamshiralar bazasi',
        preview: 'Yo‘nalishlarni tekshirish',
        import: 'Import qilish',
        selectProfession: 'Kasbni tanlang',
        noPreview: 'Yo‘nalishlar topilmadi.',
        statusIdle: 'Importga tayyor',
        statusPreview: 'Fayl tekshirilmoqda… (katta fayllar 2 min gacha vaqt olishi mumkin)',
        statusImport: 'Yo‘nalishlar import qilinmoqda… Kuting.',
        statusDone: 'Import tugadi.',
      };
    }
    return {
      title: 'Импорт',
      subtitle: 'Загрузите XLSX с экзаменами и вопросами.',
      choose: 'Выбрать файл',
      run: 'Запустить импорт',
      note: 'Отчет по валидации и импорту появится здесь.',
      doctor: 'База врачей',
      nurse: 'База медсестер',
      preview: 'Проверить направления',
      import: 'Импортировать',
      selectProfession: 'Выберите профессию',
      noPreview: 'Направления не найдены.',
      statusIdle: 'Готов к импорту',
      statusPreview: 'Проверка файла… (крупный файл — до 2 мин)',
      statusImport: 'Импорт направлений… Подождите.',
      statusDone: 'Импорт завершён.',
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

  async function handlePreview() {
    if (!fileBase64 || !profession) return;
    setPreviewLoading(true);
    setErrorMessage(null);
    setStatusBar('preview');
    try {
      // #region agent log
      const jsonPayload = { profession, fileBase64 };
      const jsonStr = JSON.stringify(jsonPayload);
      const jsonSizeMB = new Blob([jsonStr]).size / (1024 * 1024);
      fetch('http://127.0.0.1:7242/ingest/4fc32459-9fe7-40db-9541-c82348e3184a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'import/page.tsx:111',message:'Preview request start',data:{fileBase64Length:fileBase64.length,jsonSizeMB:jsonSizeMB.toFixed(2),profession},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const { response, data } = await apiFetch('/admin/import/preview', {
        method: 'POST',
        json: jsonPayload,
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/4fc32459-9fe7-40db-9541-c82348e3184a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'import/page.tsx:123',message:'Preview request success',data:{status:response.status,directionsCount:payload?.preview?.directions?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/4fc32459-9fe7-40db-9541-c82348e3184a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'import/page.tsx:125',message:'Preview request error',data:{errorName:e instanceof Error ? e.name : 'unknown',errorMessage:e instanceof Error ? e.message : String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
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
    setStatusBar('import');
    try {
      const { response, data } = await apiFetch('/admin/import/execute', {
        method: 'POST',
        json: { profession, fileBase64 },
        timeoutMs: 300_000,
      });
      if (!response.ok) {
        const errDetail = typeof (data as { error?: string })?.error === 'string' ? (data as { error: string }).error : '';
        setErrorMessage(errDetail ? `Import failed: ${errDetail}` : 'Import failed.');
        return;
      }
      setStatusBar('done');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Import request failed.');
      setStatusBar('idle');
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <Card className="space-y-4">
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
              <input
                type="file"
                accept=".xlsx"
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                className="text-sm text-slate-600"
              />
              {fileName ? (
                <p className="text-sm text-slate-600">{fileName}</p>
              ) : null}
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
            </Card>

            <Card title={copy.preview}>
              {previewLoading ? (
                <p className="text-sm text-slate-600">{copy.note}</p>
              ) : preview.length === 0 ? (
                <p className="text-sm text-slate-600">{copy.noPreview}</p>
              ) : (
                <div className="flex flex-col gap-2 text-sm text-slate-700">
                  {preview.map((item) => (
                    <div
                      key={`${item.name}-${item.language}`}
                      className="flex items-center justify-between"
                    >
                      <span>{item.name}</span>
                      <span className="text-xs text-slate-500">
                        {item.language} · {item.questionCount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
