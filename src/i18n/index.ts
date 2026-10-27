import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { UiLocale } from '@/domain/units/format';
import en from './locales/en.json';
import nl from './locales/nl.json';

const STORAGE_KEY = 'bydh.locale';

function readStoredLocale(): UiLocale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'en' || value === 'nl' ? value : null;
  } catch {
    return null;
  }
}

function detectLocale(): UiLocale {
  return readStoredLocale() ?? (navigator.language.toLowerCase().startsWith('nl') ? 'nl' : 'en');
}

export function setLocale(locale: UiLocale): void {
  void i18n.changeLanguage(locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage blocked: the choice simply lasts for this session.
  }
}

export function currentLocale(): UiLocale {
  return i18n.language === 'nl' ? 'nl' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, nl: { translation: nl } },
  lng: detectLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export default i18n;
