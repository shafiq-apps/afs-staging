// logger.ts
export type LogLevel = "debug" | "log" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  log: 20,
  info: 30,
  warn: 40,
  error: 50,
};

export interface LoggerOptions {
  level?: LogLevel;
  env?: string;
  prefix?: string;
}

const getDefaultLogLevel = (env?: string): LogLevel => {
  switch (env) {
    case "production":
      return "warn";
    case "staging":
      return "info";
    default:
      return "debug";
  }
};

export function createLogger(options: LoggerOptions = {}) {
  const env = options.env ?? process.env.NODE_ENV ?? "development";
  const level = options.level ?? getDefaultLogLevel(env);
  const prefix = options.prefix ?? "APP";

  const currentLevelPriority = LOG_LEVEL_PRIORITY[level];

  const shouldLog = (logLevel: LogLevel) =>
    LOG_LEVEL_PRIORITY[logLevel] >= currentLevelPriority;

  const format = (logLevel: LogLevel, args: any[]) => {
    const timestamp = new Date().toISOString();
    return [
      `[${timestamp}]`,
      `[${prefix}]`,
      `[${logLevel.toUpperCase()}]`,
      ...args,
    ];
  };

  const logger = {
    debug: (...args: any[]) => {
      if (shouldLog("debug")) {
        console.debug(...format("debug", args));
      }
    },
    log: (...args: any[]) => {
      if (shouldLog("log")) {
        console.log(...format("log", args));
      }
    },
    info: (...args: any[]) => {
      if (shouldLog("info")) {
        console.info(...format("info", args));
      }
    },
    warn: (...args: any[]) => {
      if (shouldLog("warn")) {
        console.warn(...format("warn", args));
      }
    },
    error: (...args: any[]) => {
      if (shouldLog("error")) {
        console.error(...format("error", args));
      }
    },
  };

  return logger;
}