'use client';

import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import {
  applySettings,
  defaultSettings,
  fontSizes,
  fontWeights,
  languages,
  readSettings,
  themes,
  writeSettings,
} from '../../../lib/uiSettings';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const [language, setLanguage] = useState(defaultSettings.language);
  const [theme, setTheme] = useState(defaultSettings.theme);
  const [fontSize, setFontSize] = useState(defaultSettings.fontSize);
  const [fontWeight, setFontWeight] = useState(defaultSettings.fontWeight);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const saved = readSettings();
    setLanguage(saved.language);
    setTheme(saved.theme);
    setFontSize(saved.fontSize);
    setFontWeight(saved.fontWeight);
    applySettings(saved);
    setIsReady(true);
  }, []);

  const activeSettings = useMemo(
    () => ({
      language,
      theme,
      fontSize,
      fontWeight,
    }),
    [language, theme, fontSize, fontWeight]
  );

  useEffect(() => {
    if (!isReady) return;
    const next = activeSettings;
    applySettings(next);
    writeSettings(next);
  }, [activeSettings, isReady]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Settings',
        subtitle: 'Adjust the interface to your preferences.',
        languageTitle: 'Interface language',
        themeTitle: 'Interface theme',
        fontSizeTitle: 'Font size',
        fontWeightTitle: 'Font weight',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Sozlamalar',
        subtitle: 'Interfeysni o‘zingizga moslang.',
        languageTitle: 'Interfeys tili',
        themeTitle: 'Interfeys mavzusi',
        fontSizeTitle: 'Shrift o‘lchami',
        fontWeightTitle: 'Shrift qalinligi',
      };
    }
    return {
      title: 'Настройки',
      subtitle: 'Настройте интерфейс под себя.',
      languageTitle: 'Язык интерфейса',
      themeTitle: 'Тема интерфейса',
      fontSizeTitle: 'Размер шрифта',
      fontWeightTitle: 'Жирность текста',
    };
  }, [language]);

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <PageHeader title={copy.title} subtitle={copy.subtitle} />

        <Card title={copy.languageTitle}>
          <div className="flex flex-col gap-2">
            {languages.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLanguage(item)}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  language === item
                    ? 'border-[#2AABEE] bg-[#2AABEE] text-white'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </Card>

        <Card title={copy.themeTitle}>
          <div className="flex gap-2">
            {themes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTheme(item)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                  theme === item
                    ? 'border-[#2AABEE] bg-[#2AABEE] text-white'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </Card>

        <Card title={copy.fontSizeTitle}>
          <div className="flex flex-col gap-2">
            {fontSizes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFontSize(item)}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  fontSize === item
                    ? 'border-[#2AABEE] bg-[#2AABEE] text-white'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </Card>

        <Card title={copy.fontWeightTitle}>
          <div className="flex gap-2">
            {fontWeights.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFontWeight(item)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                  fontWeight === item
                    ? 'border-[#2AABEE] bg-[#2AABEE] text-white'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </Card>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
