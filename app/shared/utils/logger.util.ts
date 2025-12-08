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
      if (isModuleDisabled(defaultModule)) return;
      console.debug(...formatLog({ level: 'debug', module: defaultModule }, ...args));
    },
    info: (...args: any[]) => {
      if (isModuleDisabled(defaultModule)) return;
      console.log(...formatLog({ level: 'info', module: defaultModule }, ...args));
    },
    warn: (...args: any[]) => {
      if (isModuleDisabled(defaultModule)) return;
      console.warn(...formatLog({ level: 'warn', module: defaultModule }, ...args));
    },
    error: (...args: any[]) => {
      if (isModuleDisabled(defaultModule)) return;
      console.error(...formatLog({ level: 'error', module: defaultModule }, ...args));
    },
    log: (...args: any[]) => {
      if (isModuleDisabled(defaultModule)) return;
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
