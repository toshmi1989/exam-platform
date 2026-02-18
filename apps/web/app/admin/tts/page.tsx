'use client';

import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import Button from '../../../components/Button';
import AdminGuard from '../components/AdminGuard';
import AdminNav from '../components/AdminNav';
import { readSettings, Language } from '../../../lib/uiSettings';
import {
  getAdminTtsSettings,
  updateAdminTtsSettings,
  getAdminTtsStats,
  clearAllTtsData,
  getAdminTtsDirections,
  clearTtsDataByDirection,
  type AdminTtsSettings,
  type TtsDirectionItem,
} from '../../../lib/api';

const VOICES_RU = [
  { value: 'ru-RU-SvetlanaNeural', label: 'Svetlana (ж)' },
  { value: 'ru-RU-DmitryNeural', label: 'Dmitry (м)' },
];

const VOICES_UZ = [
  { value: 'uz-UZ-MadinaNeural', label: 'Madina (ж)' },
  { value: 'uz-UZ-SardorNeural', label: 'Sardor (м)' },
];

export default function AdminTtsPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [settings, setSettings] = useState<AdminTtsSettings | null>(null);
  const [stats, setStats] = useState<{ scriptsCount: number; audioCount: number } | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [voiceRu, setVoiceRu] = useState('ru-RU-SvetlanaNeural');
  const [voiceUz, setVoiceUz] = useState('uz-UZ-MadinaNeural');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [directions, setDirections] = useState<TtsDirectionItem[]>([]);
  const [selectedDirectionId, setSelectedDirectionId] = useState('');
  const [isClearingDirection, setIsClearingDirection] = useState(false);
  const [clearDirectionConfirm, setClearDirectionConfirm] = useState(false);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    getAdminTtsSettings()
      .then((s) => {
        setSettings(s);
        setEnabled(s.enabled);
        setVoiceRu(s.voiceRu);
        setVoiceUz(s.voiceUz);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load'));
    getAdminTtsStats()
      .then(setStats)
      .catch(() => setStats(null));
    getAdminTtsDirections()
      .then(setDirections)
      .catch(() => setDirections([]));
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Azure TTS',
        subtitle: 'Voice and recording settings for oral exam.',
        status: 'Status',
        keyConfigured: 'API key',
        regionConfigured: 'Region',
        enabled: 'TTS enabled',
        voiceRu: 'Russian voice',
        voiceUz: 'Uzbek voice',
        save: 'Save',
        records: 'Records',
        scriptsCount: 'Scripts',
        audioCount: 'Audio files',
        clearAll: 'Clear all TTS data',
        clearConfirm: 'Delete all scripts and audio? This cannot be undone.',
        clearYes: 'Yes, clear all',
        clearNo: 'Cancel',
        clearByDirection: 'Clear TTS by direction',
        directionLabel: 'Direction',
        clearThisDirection: 'Clear TTS for this direction',
        clearDirectionConfirm: 'Delete scripts and audio for this direction only?',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Azure TTS',
        subtitle: 'Og\'zaki imtihon uchun ovoz va yozuv sozlamalari.',
        status: 'Holat',
        keyConfigured: 'API kaliti',
        regionConfigured: 'Region',
        enabled: 'TTS yoqilgan',
        voiceRu: 'Ruscha ovoz',
        voiceUz: 'O\'zbekcha ovoz',
        save: 'Saqlash',
        records: 'Yozuvlar',
        scriptsCount: 'Skriptlar',
        audioCount: 'Audio fayllar',
        clearAll: 'Barcha TTS ma\'lumotlarini tozalash',
        clearConfirm: 'Barcha skriptlar va audiolar o\'chirilsinmi? Qaytarib bo\'lmaydi.',
        clearYes: 'Ha, tozalash',
        clearNo: 'Bekor qilish',
        clearByDirection: 'TTS ni yo\'nalish bo\'yicha tozalash',
        directionLabel: 'Yo\'nalish',
        clearThisDirection: 'Shu yo\'nalish uchun TTS ni tozalash',
        clearDirectionConfirm: 'Faqat shu yo\'nalish uchun skriptlar va audiolar o\'chirilsinmi?',
      };
    }
    return {
      title: 'Azure TTS',
      subtitle: 'Настройки озвучки и записей для устного экзамена.',
      status: 'Статус',
      keyConfigured: 'API‑ключ',
      regionConfigured: 'Регион',
      enabled: 'Озвучка включена',
      voiceRu: 'Голос (русский)',
      voiceUz: 'Голос (узбекский)',
      save: 'Сохранить',
      records: 'Записи',
      scriptsCount: 'Скрипты',
      audioCount: 'Аудиофайлы',
      clearAll: 'Очистить все данные TTS',
      clearConfirm: 'Удалить все скрипты и аудио? Отменить нельзя.',
      clearYes: 'Да, очистить',
      clearNo: 'Отмена',
      clearByDirection: 'Очистить TTS по направлению',
      directionLabel: 'Направление',
      clearThisDirection: 'Очистить TTS для этого направления',
      clearDirectionConfirm: 'Удалить скрипты и аудио только по выбранному направлению?',
    };
  }, [language]);

  async function handleSave() {
    setSaveError(null);
    setIsSaving(true);
    try {
      const updated = await updateAdminTtsSettings({ enabled, voiceRu, voiceUz });
      setSettings(updated);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Не удалось сохранить.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClearAll() {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    setIsClearing(true);
    setSaveError(null);
    try {
      await clearAllTtsData();
      setStats({ scriptsCount: 0, audioCount: 0 });
      setClearConfirm(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Ошибка очистки.');
    } finally {
      setIsClearing(false);
    }
  }

  async function handleClearByDirection() {
    if (!selectedDirectionId) return;
    if (!clearDirectionConfirm) {
      setClearDirectionConfirm(true);
      return;
    }
    setIsClearingDirection(true);
    setSaveError(null);
    try {
      const result = await clearTtsDataByDirection(selectedDirectionId);
      setStats((prev) => ({
        scriptsCount: Math.max(0, (prev?.scriptsCount ?? 0) - result.scriptsDeleted),
        audioCount: Math.max(0, (prev?.audioCount ?? 0) - result.audioDeleted),
      }));
      setClearDirectionConfirm(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Ошибка очистки по направлению.');
    } finally {
      setIsClearingDirection(false);
    }
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            {loadError && (
              <p className="text-sm text-rose-600">{loadError}</p>
            )}
            {saveError && (
              <p className="text-sm text-rose-600">{saveError}</p>
            )}

            <Card title={copy.status}>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className={settings?.keyConfigured ? 'text-green-600' : 'text-amber-600'}>
                  {copy.keyConfigured}: {settings?.keyConfigured ? '✓' : '—'}
                </span>
                <span className={settings?.regionConfigured ? 'text-green-600' : 'text-amber-600'}>
                  {copy.regionConfigured}: {settings?.regionConfigured ? '✓' : '—'}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Ключ и регион задаются в переменных окружения (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION) на сервере.
              </p>
            </Card>

            <Card title={copy.enabled}>
              <div className="flex gap-2">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setEnabled(v)}
                    className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                      enabled === v
                        ? 'border-[#2AABEE] bg-[#2AABEE] text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {v ? 'Вкл' : 'Выкл'}
                  </button>
                ))}
              </div>
            </Card>

            <Card title={copy.voiceRu}>
              <select
                value={voiceRu}
                onChange={(e) => setVoiceRu(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#2AABEE]"
              >
                {VOICES_RU.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Card>

            <Card title={copy.voiceUz}>
              <select
                value={voiceUz}
                onChange={(e) => setVoiceUz(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#2AABEE]"
              >
                {VOICES_UZ.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Card>

            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="w-full"
            >
              {isSaving ? '…' : copy.save}
            </Button>

            <Card title={copy.clearByDirection}>
              <p className="mb-2 text-xs text-slate-500">
                {copy.directionLabel}
              </p>
              <select
                value={selectedDirectionId}
                onChange={(e) => setSelectedDirectionId(e.target.value)}
                className="mb-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#2AABEE]"
              >
                <option value="">—</option>
                {directions.map((d) => (
                  <option key={d.directionGroupId} value={d.directionGroupId}>
                    {d.label} — {d.audioCount ?? 0} {language === 'Английский' ? 'audio' : language === 'Узбекский' ? 'audio' : 'аудио'}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                {!clearDirectionConfirm ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleClearByDirection}
                    disabled={!selectedDirectionId || isClearingDirection}
                  >
                    {copy.clearThisDirection}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleClearByDirection}
                      disabled={isClearingDirection}
                    >
                      {language === 'Английский' ? 'Yes, clear' : language === 'Узбекский' ? 'Ha, tozalash' : 'Да, очистить'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setClearDirectionConfirm(false)}
                    >
                      {copy.clearNo}
                    </Button>
                  </>
                )}
              </div>
              {clearDirectionConfirm && (
                <p className="mt-2 text-xs text-amber-600">{copy.clearDirectionConfirm}</p>
              )}
            </Card>

            <Card title={copy.records}>
              <p className="text-sm text-slate-600">
                {copy.scriptsCount}: {stats?.scriptsCount ?? '—'}
              </p>
              <p className="text-sm text-slate-600">
                {copy.audioCount}: {stats?.audioCount ?? '—'}
              </p>
              <div className="mt-4 flex gap-2">
                {!clearConfirm ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleClearAll}
                    disabled={isClearing || (stats?.audioCount === 0 && stats?.scriptsCount === 0)}
                  >
                    {copy.clearAll}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleClearAll}
                      disabled={isClearing}
                    >
                      {copy.clearYes}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setClearConfirm(false)}
                    >
                      {copy.clearNo}
                    </Button>
                  </>
                )}
              </div>
              {clearConfirm && (
                <p className="mt-2 text-xs text-amber-600">{copy.clearConfirm}</p>
              )}
            </Card>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
