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
      this.level = 'debug';
      this.info('Logger enabled');
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
  
  // Auto-enable in development
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('dev')) {
      Logger.enable();
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

