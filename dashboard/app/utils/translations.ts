import enTranslations from '../translations/en.json';

type TranslationKey = string;
type TranslationParams = Record<string, string | number>;

// Supported languages
export type SupportedLanguage = 'en';

// Translation data structure
type Translations = typeof enTranslations;

// Load translations for a specific language
function loadTranslations(lang: SupportedLanguage): Translations {
  switch (lang) {
    case 'en':
      return enTranslations;
    default:
      return enTranslations;
  }
}

// Get current language (can be extended to read from user preferences, URL, etc.)
export function getCurrentLanguage(): SupportedLanguage {
  // For now, default to English
  // TODO: Add logic to detect user's preferred language
  return 'en';
}

// Translation function
export function t(key: TranslationKey, params?: TranslationParams): string {
  const lang = getCurrentLanguage();
  const translations = loadTranslations(lang);
  
  // Navigate through nested object using dot notation
  const keys = key.split('.');
  let value: any = translations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k as keyof typeof value];
    } else {
      // Key not found, return the key itself
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }
  
  // If value is a string, replace placeholders
  if (typeof value === 'string' && params) {
    return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params[paramKey]?.toString() || match;
    });
  }
  
  return typeof value === 'string' ? value : key;
}

// React hook for translations
export function useTranslation() {
  const lang = getCurrentLanguage();
  
  return {
    t: (key: TranslationKey, params?: TranslationParams) => t(key, params),
    language: lang,
  };
}


