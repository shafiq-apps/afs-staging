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

/**
 * Global log configuration (no process.env)
 * Default min level is INFO
 */
const logConfig = {
  enabled: true,
  minLevel: 'info' as LogLevel,
};

export const setLogEnabled = (enabled: boolean): void => {
  logConfig.enabled = enabled;
};

export const setLogLevel = (level: LogLevel): void => {
  logConfig.minLevel = level;
};

const normalizeModuleName = (moduleName?: string): string =>
  (moduleName ?? '').trim();

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

const shouldLog = (level: LogLevel, moduleName?: string): boolean => {
  if (!logConfig.enabled) return false;
  if (isModuleDisabled(defaultModuleName(moduleName))) return false;

  return LEVEL_RANK[level] >= LEVEL_RANK[logConfig.minLevel];
};

/**
 * Disable logging for a specific module
 */
export const disableModuleLogs = (moduleName: string): void => {
  disabledModules.add(moduleName);
};

/**
 * Enable logging for a specific module (if it was previously disabled)
 */
export const enableModuleLogs = (moduleName: string): void => {
  disabledModules.delete(moduleName);
};

/**
 * Disable logging for multiple modules at once
 */
export const disableModuleLogsBatch = (moduleNames: string[]): void => {
  moduleNames.forEach((name) => disabledModules.add(name));
};

/**
 * Enable logging for multiple modules at once
 */
export const enableModuleLogsBatch = (moduleNames: string[]): void => {
  moduleNames.forEach((name) => disabledModules.delete(name));
};

/**
 * Get list of currently disabled modules
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
 */
export const isModuleLogsDisabled = (moduleName: string): boolean => {
  return disabledModules.has(moduleName);
};

/**
 * Get formatted timestamp
 */
const getTimestamp = (): string => {
  return new Date().toISOString();
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
const createLogger = (
  defaultModule?: string,
  disabled: boolean = false
): Logger => {
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
 */
export const createModuleLogger = (
  moduleName: string,
  options?: LoggerOptions
): Logger => {
  return createLogger(moduleName, options?.disabled ?? false);
};
