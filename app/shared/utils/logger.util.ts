/**
 * Logger Utility
 * Module-based logging with timestamps and context
 * Supports disabling logs for specific modules
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  level: LogLevel;
  module?: string;
  timestamp?: boolean;
}

interface LoggerOptions {
  disabled?: boolean;
}

interface Logger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  log: (...args: any[]) => void;
}

/**
 * Set of disabled module names
 * Modules in this set will not output any logs
 */
const disabledModules = new Set<string>();

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const parseEnvBool = (value: string | undefined): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  const v = String(value).toLowerCase().trim();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return undefined;
};

const parseCsv = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

const normalizeModuleName = (moduleName?: string): string => (moduleName ?? '').trim();

const getEnvMinLevel = (): LogLevel | null => {
  const raw = (process.env.LOG_LEVEL || '').toLowerCase().trim();
  if (!raw) return null;
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return null;
};

const isGloballyDisabledByEnv = (): boolean => {
  // LOG_DISABLED=true disables *all* logs
  return parseEnvBool(process.env.LOG_DISABLED) === true;
};

const isModuleDisabledByEnv = (moduleName?: string): boolean => {
  const name = normalizeModuleName(moduleName);
  if (!name) return false;

  // Legacy cache logging toggle (kept for backwards compatibility)
  if (
    (name === 'cache' || name === 'cache-service') &&
    parseEnvBool(process.env.CACHE_LOG_DISABLED) === true
  ) {
    return true;
  }

  const enabledOnly = parseCsv(process.env.LOG_ENABLED_MODULES);
  if (enabledOnly.length > 0) {
    // If an allow-list is set, disable everything not explicitly listed.
    return !enabledOnly.some((m) => normalizeModuleName(m) === name);
  }

  const disabledByEnv = parseCsv(process.env.LOG_DISABLED_MODULES);
  return disabledByEnv.some((m) => normalizeModuleName(m) === name);
};

const shouldLog = (level: LogLevel, moduleName?: string): boolean => {
  if (isGloballyDisabledByEnv()) return false;
  if (isModuleDisabled(defaultModuleName(moduleName))) return false;
  if (isModuleDisabledByEnv(moduleName)) return false;

  const minLevel = getEnvMinLevel();
  if (!minLevel) return true;
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
};

function defaultModuleName(moduleName?: string): string | undefined {
  const name = normalizeModuleName(moduleName);
  return name || undefined;
}

/**
 * Check if a module is disabled
 */
const isModuleDisabled = (moduleName?: string): boolean => {
  if (!moduleName) return false;
  return disabledModules.has(moduleName);
};

/**
 * Disable logging for a specific module
 * @param moduleName - Name of the module to disable (e.g., 'products', 'ProductFiltersRoute')
 * 
 * @example
 * disableModuleLogs('ProductFiltersRoute');
 * disableModuleLogs('storefront-service');
 */
export const disableModuleLogs = (moduleName: string): void => {
  disabledModules.add(moduleName);
};

/**
 * Enable logging for a specific module (if it was previously disabled)
 * @param moduleName - Name of the module to enable
 * 
 * @example
 * enableModuleLogs('ProductFiltersRoute');
 */
export const enableModuleLogs = (moduleName: string): void => {
  disabledModules.delete(moduleName);
};

/**
 * Disable logging for multiple modules at once
 * @param moduleNames - Array of module names to disable
 * 
 * @example
 * disableModuleLogsBatch(['ProductFiltersRoute', 'storefront-service', 'products']);
 */
export const disableModuleLogsBatch = (moduleNames: string[]): void => {
  moduleNames.forEach(name => disabledModules.add(name));
};

/**
 * Enable logging for multiple modules at once
 * @param moduleNames - Array of module names to enable
 * 
 * @example
 * enableModuleLogsBatch(['ProductFiltersRoute', 'storefront-service']);
 */
export const enableModuleLogsBatch = (moduleNames: string[]): void => {
  moduleNames.forEach(name => disabledModules.delete(name));
};

/**
 * Get list of currently disabled modules
 * @returns Array of disabled module names
 */
export const getDisabledModules = (): string[] => {
  return Array.from(disabledModules);
};

/**
 * Clear all disabled modules (enable all logs)
 */
export const clearDisabledModules = (): void => {
  disabledModules.clear();
};

/**
 * Check if a module is currently disabled
 * @param moduleName - Name of the module to check
 * @returns true if the module is disabled, false otherwise
 */
export const isModuleLogsDisabled = (moduleName: string): boolean => {
  return disabledModules.has(moduleName);
};

/**
 * Apply logger configuration from environment variables.
 *
 * Supported env vars:
 * - LOG_DISABLED=true|false: disables all logs
 * - LOG_LEVEL=debug|info|warn|error: minimum level to output
 * - LOG_DISABLED_MODULES=csv: disables specific modules (e.g. "cache,storefront-service")
 * - LOG_ENABLED_MODULES=csv: allow-list (only these modules log; overrides disabled list)
 */
export const applyLoggerEnvConfig = (): void => {
  // If an allow-list is provided, prefer it and disable everything else.
  const enabledOnly = parseCsv(process.env.LOG_ENABLED_MODULES);
  if (enabledOnly.length > 0) {
    disabledModules.clear();
    // We don't eagerly disable "all others" here; that's handled dynamically by isModuleDisabledByEnv().
    return;
  }

  // Merge disabled modules into the in-memory set (non-destructive).
  const disabledByEnv = parseCsv(process.env.LOG_DISABLED_MODULES);
  disabledByEnv.forEach((m) => disabledModules.add(m));

  // Back-compat: CACHE_LOG_DISABLED disables cache module logs.
  if (parseEnvBool(process.env.CACHE_LOG_DISABLED) === true) {
    disabledModules.add('cache');
    disabledModules.add('cache-service');
  }
};

/**
 * Get formatted timestamp
 */
const getTimestamp = (): string => {
  const now = new Date();
  return now.toISOString();
};

/**
 * Format log message with context
 */
const formatLog = (context: LogContext, ...args: any[]): any[] => {
  const { level, module, timestamp = true } = context;
  const time = timestamp ? `[${getTimestamp()}]` : '';
  const mod = module ? `[${module}]` : '[app]';
  const levelTag = `[${level.toUpperCase()}]`;
  
  return [time, mod, levelTag, ...args].filter(Boolean);
};

/**
 * Create a logger instance with optional default module name
 */
const createLogger = (defaultModule?: string, disabled: boolean = false): Logger => {
  // If disabled at creation time, add to disabled set
  if (disabled && defaultModule) {
    disabledModules.add(defaultModule);
  }

  return {
    debug: (...args: any[]) => {
      if (!shouldLog('debug', defaultModule)) return;
      console.debug(...formatLog({ level: 'debug', module: defaultModule }, ...args));
    },
    info: (...args: any[]) => {
      if (!shouldLog('info', defaultModule)) return;
      console.log(...formatLog({ level: 'info', module: defaultModule }, ...args));
    },
    warn: (...args: any[]) => {
      if (!shouldLog('warn', defaultModule)) return;
      console.warn(...formatLog({ level: 'warn', module: defaultModule }, ...args));
    },
    error: (...args: any[]) => {
      if (!shouldLog('error', defaultModule)) return;
      console.error(...formatLog({ level: 'error', module: defaultModule }, ...args));
    },
    log: (...args: any[]) => {
      if (!shouldLog('info', defaultModule)) return;
      console.log(...formatLog({ level: 'info', module: defaultModule }, ...args));
    },
  };
};

/**
 * Global logger (no module context)
 */
export const logger = createLogger();

/**
 * Create a module-specific logger
 * @param moduleName - Name of the module (e.g., 'products', 'system', 'cache')
 * @param options - Optional configuration object
 * @param options.disabled - If true, disables all logs for this module
 * @returns Logger instance with module context
 * 
 * @example
 * const log = createModuleLogger('products');
 * log.info('Product loaded'); // [2024-01-01T00:00:00.000Z] [products] [INFO] Product loaded
 * 
 * // Disable logs at creation time
 * const logger = createModuleLogger('graphql-factory', { disabled: true });
 * logger.info('This will not be logged'); // No output
 * 
 * // Disable logs after creation
 * disableModuleLogs('products');
 * log.info('This will not be logged'); // No output
 */
export const createModuleLogger = (moduleName: string, options?: LoggerOptions): Logger => {
  return createLogger(moduleName, options?.disabled ?? false);
};
