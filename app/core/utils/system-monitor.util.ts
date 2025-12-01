/**
 * System Monitor Utility
 * Monitors CPU and memory usage with event-driven notifications
 */

import { EventEmitter } from 'events';
import si from 'systeminformation';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('system-monitor');

export interface ResourceUsage {
  cpuPercent: number;
  memoryPercent: number;
  memoryUsed: string;
  memoryTotal: string;
  isHigh: boolean;
}

export interface Thresholds {
  cpu: number; // 0–1
  memory: number; // 0–1
}

export interface MonitorEvents {
  high: (usage: ResourceUsage) => void;
  normal: (usage: ResourceUsage) => void;
}

/**
 * Typed EventEmitter
 */
export declare interface ResourceMonitor {
  on<U extends keyof MonitorEvents>(
    event: U,
    listener: MonitorEvents[U]
  ): this;

  emit<U extends keyof MonitorEvents>(
    event: U,
    ...args: Parameters<MonitorEvents[U]>
  ): boolean;
}

export class SystemMonitor extends EventEmitter {
  public usage: ResourceUsage = {
    cpuPercent: 0,
    memoryPercent: 0,
    memoryUsed: '0 B',
    memoryTotal: '0 B',
    isHigh: false,
  };

  private intervalId: NodeJS.Timeout | null = null;
  private readonly thresholds: Thresholds;

  constructor(thresholds?: Partial<Thresholds>) {
    super();

    this.thresholds = {
      cpu: thresholds?.cpu ?? 0.85, // 85%
      memory: thresholds?.memory ?? 0.85, // 85%
    };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let value = bytes;

    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(1)} ${units[i]}`;
  }

  /**
   * Start monitoring loop
   * @param interval - Monitoring interval in milliseconds (default: 1000ms)
   */
  public start(interval = 1000): this {
    if (this.intervalId) return this;

    this.intervalId = setInterval(async () => {
      try {
        const cpu = await si.currentLoad();
        const mem = await si.mem();

        const cpuPercent = cpu.currentLoad;
        const memoryPercent = (mem.active / mem.total) * 100;

        this.usage = {
          cpuPercent,
          memoryPercent,
          memoryUsed: this.formatBytes(mem.active),
          memoryTotal: this.formatBytes(mem.total),
          isHigh:
            cpuPercent / 100 > this.thresholds.cpu ||
            memoryPercent / 100 > this.thresholds.memory,
        };

        if (this.usage.isHigh) {
          logger.warn('High system usage detected', {
            cpu: `${cpuPercent.toFixed(2)}%`,
            memory: `${memoryPercent.toFixed(2)}%`,
          });
          this.emit('high', this.usage);
        } else {
          this.emit('normal', this.usage);
        }
      } catch (error: any) {
        logger.error('Error monitoring system resources', {
          error: error?.message || error,
        });
      }
    }, interval);

    return this;
  }

  /**
   * Stop monitoring loop
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
