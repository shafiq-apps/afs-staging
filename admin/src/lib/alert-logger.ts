/**
 * Alert Logging System
 * Persists alerts to disk and provides query/retrieval methods
 */

import fs from 'fs';
import path from 'path';
import { AlertEntry } from './es-monitor';

export interface LoggedAlert extends AlertEntry {
  id: string;
}

interface AlertLogIndex {
  version: number;
  createdAt: number;
  updatedAt: number;
  totalAlerts: number;
}

class AlertLogger {
  private logDir: string;
  private indexFile: string;
  private currentLogFile: string;
  private maxEntriesPerFile: number = 10000;
  private logIndex: AlertLogIndex = {
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalAlerts: 0,
  };

  constructor(logDir?: string) {
    this.logDir = logDir || path.join(process.cwd(), 'logs', 'es-alerts');
    this.indexFile = path.join(this.logDir, 'index.json');
    this.currentLogFile = path.join(this.logDir, `alerts-${this.getDateString()}.jsonl`);

    // Ensure log directory exists
    this.ensureLogDir();

    // Load or initialize index
    this.loadIndex();
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDir(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
        console.log('[AlertLogger] Log directory created:', this.logDir);
      }
    } catch (error: any) {
      console.error('[AlertLogger] Error creating log directory:', error?.message);
    }
  }

  /**
   * Get date string for log file naming (YYYY-MM-DD)
   */
  private getDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Generate unique ID for alert
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Load or initialize alert log index
   */
  private loadIndex(): void {
    try {
      if (fs.existsSync(this.indexFile)) {
        const data = fs.readFileSync(this.indexFile, 'utf-8');
        this.logIndex = JSON.parse(data);
      }
    } catch (error: any) {
      console.error('[AlertLogger] Error loading index:', error?.message);
      // Keep default index
    }
  }

  /**
   * Save index to disk
   */
  private saveIndex(): void {
    try {
      this.logIndex.updatedAt = Date.now();
      fs.writeFileSync(this.indexFile, JSON.stringify(this.logIndex, null, 2));
    } catch (error: any) {
      console.error('[AlertLogger] Error saving index:', error?.message);
    }
  }

  /**
   * Log an alert entry
   */
  log(alert: AlertEntry): LoggedAlert {
    const loggedAlert: LoggedAlert = {
      ...alert,
      id: this.generateId(),
    };

    try {
      // Ensure log file is for today
      const todayFile = path.join(this.logDir, `alerts-${this.getDateString()}.jsonl`);
      if (todayFile !== this.currentLogFile) {
        this.currentLogFile = todayFile;
      }

      // Append alert to JSONL file
      const line = JSON.stringify(loggedAlert) + '\n';
      fs.appendFileSync(this.currentLogFile, line);

      // Update index
      this.logIndex.totalAlerts++;
      this.saveIndex();

      console.log('[AlertLogger] Alert logged:', {
        id: loggedAlert.id,
        type: loggedAlert.alertType,
        node: loggedAlert.nodeName,
      });

      return loggedAlert;
    } catch (error: any) {
      console.error('[AlertLogger] Error logging alert:', error?.message);
      return loggedAlert;
    }
  }

  /**
   * Log multiple alerts
   */
  logBatch(alerts: AlertEntry[]): LoggedAlert[] {
    return alerts.map((alert) => this.log(alert));
  }

  /**
   * Get alerts from a specific date
   */
  getAlertsByDate(date: string): LoggedAlert[] {
    const logFile = path.join(this.logDir, `alerts-${date}.jsonl`);

    if (!fs.existsSync(logFile)) {
      return [];
    }

    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');

      return lines
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (error: any) {
            console.error('[AlertLogger] Error parsing line:', error?.message);
            return null;
          }
        })
        .filter((alert) => alert !== null) as LoggedAlert[];
    } catch (error: any) {
      console.error('[AlertLogger] Error reading log file:', error?.message);
      return [];
    }
  }

  /**
   * Get alerts for today
   */
  getTodayAlerts(): LoggedAlert[] {
    return this.getAlertsByDate(this.getDateString());
  }

  /**
   * Get alerts by date range
   */
  getAlertsByDateRange(startDate: string, endDate: string): LoggedAlert[] {
    const alerts: LoggedAlert[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    const current = new Date(start);
    while (current <= end) {
      const dateString = current.toISOString().split('T')[0];
      alerts.push(...this.getAlertsByDate(dateString));
      current.setDate(current.getDate() + 1);
    }

    return alerts;
  }

  /**
   * Get alerts by node ID
   */
  getAlertsByNode(nodeId: string, limit?: number): LoggedAlert[] {
    const alerts = this.getTodayAlerts().filter((alert) => alert.nodeId === nodeId);

    if (limit) {
      return alerts.slice(-limit);
    }

    return alerts;
  }

  /**
   * Get alerts by type
   */
  getAlertsByType(
    alertType: 'cpu' | 'heap' | 'ram' | 'disk',
    limit?: number
  ): LoggedAlert[] {
    const alerts = this.getTodayAlerts().filter((alert) => alert.alertType === alertType);

    if (limit) {
      return alerts.slice(-limit);
    }

    return alerts;
  }

  /**
   * Get statistics about alerts
   */
  getAlertStats(date?: string): {
    date: string;
    total: number;
    byType: Record<string, number>;
    byNode: Record<string, number>;
  } {
    const targetDate = date || this.getDateString();
    const alerts = this.getAlertsByDate(targetDate);

    const byType: Record<string, number> = {
      cpu: 0,
      heap: 0,
      ram: 0,
      disk: 0,
    };

    const byNode: Record<string, number> = {};

    for (const alert of alerts) {
      byType[alert.alertType]++;
      byNode[alert.nodeName] = (byNode[alert.nodeName] || 0) + 1;
    }

    return {
      date: targetDate,
      total: alerts.length,
      byType,
      byNode,
    };
  }

  /**
   * Clear alerts for a specific date
   */
  clearAlertsByDate(date: string): boolean {
    const logFile = path.join(this.logDir, `alerts-${date}.jsonl`);

    if (!fs.existsSync(logFile)) {
      return true;
    }

    try {
      fs.unlinkSync(logFile);
      console.log('[AlertLogger] Cleared alerts for:', date);
      return true;
    } catch (error: any) {
      console.error('[AlertLogger] Error clearing alerts:', error?.message);
      return false;
    }
  }

  /**
   * Get log directory
   */
  getLogDir(): string {
    return this.logDir;
  }

  /**
   * Get index
   */
  getIndex(): AlertLogIndex {
    return this.logIndex;
  }
}

// Export singleton instance
export const alertLogger = new AlertLogger();

/**
 * Convenience functions
 */
export function logAlert(alert: AlertEntry): LoggedAlert {
  return alertLogger.log(alert);
}

export function logAlertBatch(alerts: AlertEntry[]): LoggedAlert[] {
  return alertLogger.logBatch(alerts);
}

export function getAlertStats(date?: string) {
  return alertLogger.getAlertStats(date);
}

export function getTodayAlerts(): LoggedAlert[] {
  return alertLogger.getTodayAlerts();
}

export function getAlertsByDateRange(startDate: string, endDate: string): LoggedAlert[] {
  return alertLogger.getAlertsByDateRange(startDate, endDate);
}

export function getAlertsByNode(nodeId: string, limit?: number): LoggedAlert[] {
  return alertLogger.getAlertsByNode(nodeId, limit);
}

export function getAlertsByType(
  alertType: 'cpu' | 'heap' | 'ram' | 'disk',
  limit?: number
): LoggedAlert[] {
  return alertLogger.getAlertsByType(alertType, limit);
}
