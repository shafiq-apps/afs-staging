/**
 * Cache Manager
 * Full-featured caching system for high-performance filtering and searching
 */

import { createModuleLogger } from '@shared/utils/logger.util';

// Enable cache logging for cleanup operations (can be disabled via env var)
const logger = createModuleLogger('cache', {
  disabled: process.env.CACHE_LOG_DISABLED === 'true'
});

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds (default: 5 minutes)
  maxSize?: number; // Maximum number of entries (default: 1000)
  checkInterval?: number; // Cleanup interval in milliseconds (default: 1 minute)
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

export class CacheManager<T = any> {
  private store: Map<string, CacheEntry<T>> = new Map();
  private readonly defaultTTL: number;
  private readonly maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly checkInterval: number;
  private cleanupLogCounter: number = 0;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.ttl || 1 * 60 * 1000; // 5 minutes default
    this.maxSize = options.maxSize || 1000; // 1000 entries default
    // Ensure checkInterval is valid (must be > 0)
    const requestedInterval = options.checkInterval || 60 * 1000; // 1 minute default
    this.checkInterval = requestedInterval > 0 ? requestedInterval : 60 * 1000;

    this.startCleanup();
    if (this.isEnabled() === false) {
      logger.info('Cache disabled');
      return null;
    }
    else{
      logger.info('Cache manager initialized', {
        defaultTTL: this.defaultTTL,
        maxSize: this.maxSize,
        checkInterval: this.checkInterval,
      });
    }
  }

  isEnabled(): boolean {
    return !(process.env.CACHE_DISABLED === 'true' || process.env.CACHE_DISABLED === '1');
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    if (this.isEnabled() === false) {
      logger.info('Cache disabled', { key });
      return null;
    }
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      logger.info('Cache entry expired', { key });
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry.data;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    if (this.isEnabled() === false) {
      logger.info('Cache disabled', { key });
      return null;
    }
    const now = Date.now();
    const expiresAt = now + (ttl || this.defaultTTL);

    // If cache is full, remove least recently used entry
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data: value,
      expiresAt,
      createdAt: now,
      accessCount: 1,
      lastAccessed: now,
    };

    this.store.set(key, entry);
    logger.info('Cache entry set', { key, ttl: ttl || this.defaultTTL });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const deleted = this.store.delete(key);
    if (deleted) {
      logger.info('Cache entry deleted', { key });
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.store.size;
    this.store.clear();
    logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    let totalAccess = 0;
    let totalSize = 0;

    for (const entry of this.store.values()) {
      if (now > entry.expiresAt) {
        expired++;
      }
      totalAccess += entry.accessCount;
      totalSize += this.estimateSize(entry.data);
    }

    return {
      size: this.store.size,
      maxSize: this.maxSize,
      expired,
      hitRate: 'N/A',
      totalAccess,
      estimatedMemoryMB: (totalSize / 1024 / 1024).toFixed(2),
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.store.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.store.delete(lruKey);
      logger.info('LRU entry evicted', { key: lruKey });
    }
  }

  /**
   * Start automatic cleanup of expired entries
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.checkInterval);
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Cache cleanup stopped');
    }
  }

  /**
   * Manually trigger cleanup (for debugging/testing)
   */
  forceCleanup(): number {
    const beforeSize = this.store.size;
    this.cleanup();
    const afterSize = this.store.size;
    const cleaned = beforeSize - afterSize;
    logger.info('Manual cache cleanup triggered', { 
      beforeSize, 
      afterSize, 
      cleaned 
    });
    return cleaned;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    try {
      const now = Date.now();
      let cleaned = 0;
      const totalEntries = this.store.size;

      for (const [key, entry] of this.store.entries()) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.info('Cache cleanup completed', { 
          entriesRemoved: cleaned,
          totalEntries,
          remainingEntries: this.store.size
        });
      } else if (totalEntries > 0) {
        // Log periodically even when no cleanup is needed (every 10th run)
        if (!this.cleanupLogCounter) {
          this.cleanupLogCounter = 0;
        }
        this.cleanupLogCounter++;
        if (this.cleanupLogCounter >= 10) {
          logger.info('Cache cleanup check completed (no expired entries)', { 
            totalEntries,
            checkInterval: this.checkInterval
          });
          this.cleanupLogCounter = 0;
        }
      }
    } catch (error: any) {
      // Log error but don't stop the cleanup interval
      logger.error('Error during cache cleanup', {
        error: error?.message || error,
        stack: error?.stack,
      });
    }
  }

  /**
   * Estimate size of cached data (rough approximation)
   */
  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2;
    } catch {
      return 0;
    }
  }

  /**
   * Get all keys (for debugging)
   */
  keys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Get cache entry metadata
   */
  getEntryInfo(key: string) {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    return {
      key,
      age: now - entry.createdAt,
      expiresIn: Math.max(0, entry.expiresAt - now),
      accessCount: entry.accessCount,
      lastAccessed: entry.lastAccessed,
      isExpired: now > entry.expiresAt,
    };
  }
}

