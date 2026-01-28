// translation.ts

import { Lang } from "../locals";

let currentLanguage: keyof typeof Lang = 'en';

/**
 * Set the active language
 */
export function setLanguage(lang: keyof typeof Lang) {
  if (Lang[lang]) {
    currentLanguage = lang;
  } else {
    console.warn(`Language "${lang}" not found, falling back to English.`);
    currentLanguage = 'en';
  }
}

/**
 * Get a translation string using a key path like 'buttons.quickAdd'
 */
export function t(key: string, fallback?: string): string {
  const keys = key.split('.');
  let value: any = Lang[currentLanguage];

  for (const k of keys) {
    if (value && k in value) {
      value = value[k];
    } else {
      // fallback to English if missing
      value = Lang.en;
      for (const k2 of keys) {
        if (value && k2 in value) {
          value = value[k2];
        } else {
          return fallback || key;
        }
      }
      break;
    }
  }

  return typeof value === 'string' ? value : fallback || key;
}