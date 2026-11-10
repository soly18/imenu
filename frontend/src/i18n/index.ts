import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translation files
import en from './locales/en.json';
import he from './locales/he.json';
import ar from './locales/ar.json';
import ru from './locales/ru.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he },
      ar: { translation: ar },
      ru: { translation: ru },
    },
    fallbackLng: 'he',
    supportedLngs: ['en', 'he', 'ar', 'ru'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

// Update document direction on language change
const applyDir = (lng: string) => {
  const base = (lng || 'he').split('-')[0];
  document.documentElement.dir = ['he', 'ar'].includes(base) ? 'rtl' : 'ltr';
  document.documentElement.lang = base;
};
i18n.on('languageChanged', applyDir);
applyDir(i18n.resolvedLanguage || i18n.language); // also apply on first load

export default i18n;
