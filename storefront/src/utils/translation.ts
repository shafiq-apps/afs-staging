import { $ } from "./$.utils";

// translation.ts
type TranslationTree = Record<string, any>;

let translations: TranslationTree | null = null;
/**
 * Initialize translations from the JSON script tag rendered by Liquid.
 * This will read from:
 *   <script type="application/json" id="digitalcoo-translations">...</script>
 */
export function initTranslations(scriptId: string = 'digitalcoo-translations'): void {
  translations = $.getJsonFromScript(scriptId);
}

/**
 * Get a translation string using a key path like 'buttons.quickAdd'.
 *
 * Example:
 *   t('buttons.soldOut') -> "Sold out"
 */
export function t(key: string, fallback?: string): string {
  if (!translations) {
    // If initTranslations wasn't called yet, try to initialize lazily.
    initTranslations();
  }

  const source = translations || {};

  const keys = key.split('.');
  let value: any = source;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return fallback || key;
    }
  }

  return typeof value === 'string' ? value : fallback || key;
}