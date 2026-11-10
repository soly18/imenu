import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import he from './he.json'
import ar from './ar.json'
import ru from './ru.json'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, he: { translation: he }, ar: { translation: ar }, ru: { translation: ru } },
  lng: localStorage.getItem('imenu_lang') || 'he',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

// Auto RTL for Hebrew and Arabic
i18n.on('languageChanged', (lng) => {
  const isRTL = ['he', 'ar'].includes(lng)
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr'
  document.documentElement.lang = lng
  localStorage.setItem('imenu_lang', lng)
})

// Apply on initial load
const initialLng = localStorage.getItem('imenu_lang') || 'he'
document.documentElement.dir = ['he', 'ar'].includes(initialLng) ? 'rtl' : 'ltr'
document.documentElement.lang = initialLng

export default i18n
