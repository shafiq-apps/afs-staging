/**
 * Advanced Filter Search - Logger
 * Logging utility with configurable levels
 */
(function(global) {
  'use strict';
  
  const Logger = {
    enabled: false,
    level: 'error',
    prefix: '[AFS]',
    enable() {
      this.enabled = true;
      // Don't auto-set to debug - use the level from settings or keep default
      if (!this.level || this.level === 'error') {
        this.level = 'debug'; // Default to debug if not set
      }
      this.info('Logger enabled', { level: this.level });
    },
    disable() {
      this.enabled = false;
    },
    setLevel(level) {
      const levels = { error: 0, warn: 1, info: 2, debug: 3 };
      if (levels[level] === undefined) {
        throw new Error(`Invalid log level: ${level}`);
      }
      this.level = level;
    },
    shouldLog(level) {
      if (!this.enabled) return false;
      const levels = { error: 0, warn: 1, info: 2, debug: 3 };
      return levels[level] <= levels[this.level];
    },
    error(message, data) {
      if (!this.shouldLog('error')) return;
      console.error(`${this.prefix} [Error] ${message}`, data || '');
    },
    warn(message, data) {
      if (!this.shouldLog('warn')) return;
      console.warn(`${this.prefix} [Warn] ${message}`, data || '');
    },
    info(message, data) {
      if (!this.shouldLog('info')) return;
      console.info(`${this.prefix} [Info] ${message}`, data || '');
    },
    debug(message, data) {
      if (!this.shouldLog('debug')) return;
      console.debug(`${this.prefix} [Debug] ${message}`, data || '');
    },
    performance(name, duration) {
      if (!this.shouldLog('debug')) return;
      console.debug(`${this.prefix} [Performance] ${name}: ${duration.toFixed(2)}ms`);
      if (duration > 100) {
        this.warn(`${name} exceeded 100ms target: ${duration.toFixed(2)}ms`);
      }
    }
  };
  
  // Check for enable flag from Liquid/theme settings
  // Logs are disabled by default for production
  // Enable via: window.AFS_LOGGER_ENABLED = true (set from Liquid)
  if (typeof window !== 'undefined') {
    // Check for explicit enable flag from theme settings
    if (window.AFS_LOGGER_ENABLED === true) {
      Logger.enable();
      // Set log level if provided from theme settings
      if (window.AFS_LOG_LEVEL) {
        Logger.setLevel(window.AFS_LOG_LEVEL);
      }
    }
    // Also check data attribute on body/html for theme setting
    else if (document.body && document.body.getAttribute('data-afs-logger-enabled') === 'true') {
      Logger.enable();
      const logLevel = document.body.getAttribute('data-afs-log-level');
      if (logLevel) {
        Logger.setLevel(logLevel);
      }
    }
    else if (document.documentElement && document.documentElement.getAttribute('data-afs-logger-enabled') === 'true') {
      Logger.enable();
      const logLevel = document.documentElement.getAttribute('data-afs-log-level');
      if (logLevel) {
        Logger.setLevel(logLevel);
      }
    }
  }
  
  // Expose to global namespace
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.Logger = Logger;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.Logger = Logger;
  }
  
})(typeof window !== 'undefined' ? window : this);

