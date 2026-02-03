export const UI_SETTINGS_KEY = 'calmexam.uiSettings';
export const LANGUAGE_COOKIE_KEY = 'calmexam.language';

export const languages = ['Узбекский', 'Русский', 'Английский'] as const;
export const themes = ['Светлый', 'Темный'] as const;
export const fontSizes = ['Маленький', 'Средний', 'Большой'] as const;
export const fontWeights = ['Обычный', 'Полужирный'] as const;

export type Language = (typeof languages)[number];
export type Theme = (typeof themes)[number];
export type FontSize = (typeof fontSizes)[number];
export type FontWeight = (typeof fontWeights)[number];

export interface UiSettings {
  language: Language;
  theme: Theme;
  fontSize: FontSize;
  fontWeight: FontWeight;
}

export const defaultSettings: UiSettings = {
  language: 'Русский',
  theme: 'Светлый',
  fontSize: 'Средний',
  fontWeight: 'Обычный',
};

function isValid<T extends readonly string[]>(
  value: string,
  list: T
): value is T[number] {
  return list.includes(value);
}

export function normalizeSettings(
  input: Partial<UiSettings> | null | undefined
): UiSettings {
  return {
    language:
      input?.language && isValid(input.language, languages)
        ? input.language
        : defaultSettings.language,
    theme:
      input?.theme && isValid(input.theme, themes)
        ? input.theme
        : defaultSettings.theme,
    fontSize:
      input?.fontSize && isValid(input.fontSize, fontSizes)
        ? input.fontSize
        : defaultSettings.fontSize,
    fontWeight:
      input?.fontWeight && isValid(input.fontWeight, fontWeights)
        ? input.fontWeight
        : defaultSettings.fontWeight,
  };
}

export function readSettings(): UiSettings {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const raw = window.localStorage.getItem(UI_SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return normalizeSettings(parsed);
  } catch {
    return defaultSettings;
  }
}

export function writeSettings(settings: UiSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(settings));
    document.cookie = `${LANGUAGE_COOKIE_KEY}=${encodeURIComponent(
      settings.language
    )}; Path=/; Max-Age=31536000`;
    window.dispatchEvent(new Event('ui-settings-changed'));
  } catch {
    // ignore
  }
}

export function applySettings(settings: UiSettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const themeValue = settings.theme === 'Темный' ? 'dark' : 'light';
  root.setAttribute('data-theme', themeValue);

  const fontSizePx =
    settings.fontSize === 'Маленький'
      ? '14px'
      : settings.fontSize === 'Большой'
        ? '18px'
        : '16px';
  const fontWeightValue = settings.fontWeight === 'Полужирный' ? '600' : '400';

  root.style.fontSize = fontSizePx;
  root.style.setProperty('--app-font-size', fontSizePx);
  root.style.setProperty('--app-font-weight', fontWeightValue);
}
