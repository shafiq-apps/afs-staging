/**
 * Logger Utility
 * Module-based logging with timestamps and context
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  level: LogLevel;
  module?: string;
  timestamp?: boolean;
}

interface Logger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  log: (...args: any[]) => void;
}

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
const createLogger = (defaultModule?: string): Logger => {
  return {
    debug: (...args: any[]) => {
      console.debug(...formatLog({ level: 'debug', module: defaultModule }, ...args));
    },
    info: (...args: any[]) => {
      console.log(...formatLog({ level: 'info', module: defaultModule }, ...args));
    },
    warn: (...args: any[]) => {
      console.warn(...formatLog({ level: 'warn', module: defaultModule }, ...args));
    },
    error: (...args: any[]) => {
      console.error(...formatLog({ level: 'error', module: defaultModule }, ...args));
    },
    log: (...args: any[]) => {
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
 * @returns Logger instance with module context
 * 
 * @example
 * const log = createModuleLogger('products');
 * log.info('Product loaded'); // [2024-01-01T00:00:00.000Z] [products] [INFO] Product loaded
 */
export const createModuleLogger = (moduleName: string): Logger => {
  return createLogger(moduleName);
};
