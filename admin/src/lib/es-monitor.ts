/**
 * Elasticsearch Node Monitoring Service
 * Polls Elasticsearch for node stats and detects threshold violations
 */

import { getESClient } from './elasticsearch';
import { logAlertBatch } from './alert-logger';
import Error from 'next/error';

export interface NodeStats {
  nodeId: string;
  nodeName: string;
  cpu: number;
  heapUsedPercent: number;
  ramUsedPercent: number;
  diskUsedPercent: number;
  timestamp: number;
  alerts: AlertType[];
}

export type AlertType = 'cpu' | 'heap' | 'ram' | 'disk';

export interface AlertEntry {
  nodeId: string;
  nodeName: string;
  alertType: AlertType;
  value: number;
  threshold: number;
  timestamp: number;
}

export const THRESHOLDS = {
  CPU: 85,
  HEAP: 80,
  RAM: 80,
  DISK: 90,
};

class ESMonitor {
  private pollInterval: number = 3000; // 3 seconds
  private isPolling: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastNodeStats: Map<string, NodeStats> = new Map();
  private alertLog: AlertEntry[] = [];
  private maxAlertLogSize: number = 1000;
  private callbacks: ((stats: NodeStats[]) => void)[] = [];
  private alertCallbacks: ((alerts: AlertEntry[]) => void)[] = [];

  /**
   * Start polling Elasticsearch node stats
   */
  startPolling(intervalMs: number = 3000): void {
    if (this.isPolling) {
      console.log('[ESMonitor] Already polling');
      return;
    }

    this.pollInterval = intervalMs;
    this.isPolling = true;
    console.log('[ESMonitor] Starting polling with interval:', intervalMs, 'ms');

    // Initial poll
    this.pollNodeStats().catch((error) => {
      console.error('[ESMonitor] Initial poll failed:', error?.message);
    });

    // Set up interval
    this.pollTimer = setInterval(() => {
      this.pollNodeStats().catch((error) => {
        console.error('[ESMonitor] Poll failed:', error?.message);
      });
    }, this.pollInterval);
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
    console.log('[ESMonitor] Stopped polling');
  }

  /**
   * Poll Elasticsearch for node stats
   */
  private async pollNodeStats(): Promise<void> {
    try {
      const esClient = getESClient();

      // Get node stats from Elasticsearch
      const response = await esClient.nodes.stats({
        metric: ['os', 'jvm', 'fs'],
      });

      const nodesData = response.nodes || {};
      const currentStats: NodeStats[] = [];
      const newAlerts: AlertEntry[] = [];

      // Process each node
      for (const [nodeId, nodeInfo] of Object.entries(nodesData)) {
        const node = nodeInfo as any;
        const nodeName = node.name || nodeId;

        // Extract metrics
        const stats = this.extractNodeMetrics(nodeId, nodeName, node);

        // Check for threshold violations
        const alerts = this.checkThresholds(stats, nodeId, nodeName);

        stats.alerts = alerts.map((a) => a.alertType);
        currentStats.push(stats);

        // Log new alerts (only if they're new)
        for (const alert of alerts) {
          newAlerts.push(alert);
          this.addToAlertLog(alert);
        }

        // Store in map
        this.lastNodeStats.set(nodeId, stats);
      }

      // Notify subscribers
      this.notifySubscribers(currentStats);
      if (newAlerts.length > 0) {
        this.notifyAlertSubscribers(newAlerts);
        // Log alerts to disk
        try {
          logAlertBatch(newAlerts);
        } catch (error: any) {
          console.error('[ESMonitor] Error logging alerts:', error?.message);
        }
      }
    } catch (error: any) {
      console.error('[ESMonitor] Error polling node stats:', error?.message);
    }
  }

  /**
   * Extract metrics from node info
   */
  private extractNodeMetrics(nodeId: string, nodeName: string, node: any): NodeStats {
    // CPU percentage
    const cpuPercent = node.os?.cpu?.percent || 0;

    // JVM Heap usage percentage
    const heapUsedBytes = node.jvm?.mem?.heap_used_in_bytes || 0;
    const heapMaxBytes = node.jvm?.mem?.heap_max_in_bytes || 1;
    const heapUsedPercent = (heapUsedBytes / heapMaxBytes) * 100;

    // Physical RAM usage percentage
    const osMemUsedBytes = node.os?.mem?.used_in_bytes || 0;
    const osMemTotalBytes = node.os?.mem?.total_in_bytes || 1;
    const ramUsedPercent = (osMemUsedBytes / osMemTotalBytes) * 100;

    // Disk usage percentage (from fs stats)
    let diskUsedPercent = 0;
    if (node.fs?.total) {
      const diskAvailableBytes = node.fs.total.available_in_bytes || 0;
      const diskTotalBytes = node.fs.total.total_in_bytes || 1;
      diskUsedPercent = ((diskTotalBytes - diskAvailableBytes) / diskTotalBytes) * 100;
    }

    return {
      nodeId,
      nodeName,
      cpu: Math.round(cpuPercent * 100) / 100,
      heapUsedPercent: Math.round(heapUsedPercent * 100) / 100,
      ramUsedPercent: Math.round(ramUsedPercent * 100) / 100,
      diskUsedPercent: Math.round(diskUsedPercent * 100) / 100,
      timestamp: Date.now(),
      alerts: [],
    };
  }

  /**
   * Check if metrics exceed thresholds
   */
  private checkThresholds(stats: NodeStats, nodeId: string, nodeName: string): AlertEntry[] {
    const alerts: AlertEntry[] = [];

    if (stats.cpu > THRESHOLDS.CPU) {
      alerts.push({
        nodeId,
        nodeName,
        alertType: 'cpu',
        value: stats.cpu,
        threshold: THRESHOLDS.CPU,
        timestamp: stats.timestamp,
      });
    }

    if (stats.heapUsedPercent > THRESHOLDS.HEAP) {
      alerts.push({
        nodeId,
        nodeName,
        alertType: 'heap',
        value: stats.heapUsedPercent,
        threshold: THRESHOLDS.HEAP,
        timestamp: stats.timestamp,
      });
    }

    if (stats.ramUsedPercent > THRESHOLDS.RAM) {
      alerts.push({
        nodeId,
        nodeName,
        alertType: 'ram',
        value: stats.ramUsedPercent,
        threshold: THRESHOLDS.RAM,
        timestamp: stats.timestamp,
      });
    }

    if (stats.diskUsedPercent > THRESHOLDS.DISK) {
      alerts.push({
        nodeId,
        nodeName,
        alertType: 'disk',
        value: stats.diskUsedPercent,
        threshold: THRESHOLDS.DISK,
        timestamp: stats.timestamp,
      });
    }

    return alerts;
  }

  /**
   * Get latest node stats
   */
  getLatestStats(): NodeStats[] {
    return Array.from(this.lastNodeStats.values());
  }

  /**
   * Get alert log
   */
  getAlertLog(limit?: number): AlertEntry[] {
    if (limit) {
      return this.alertLog.slice(-limit);
    }
    return [...this.alertLog];
  }

  /**
   * Add alert to log (with size limit)
   */
  private addToAlertLog(alert: AlertEntry): void {
    this.alertLog.push(alert);

    // Keep only the latest entries
    if (this.alertLog.length > this.maxAlertLogSize) {
      this.alertLog = this.alertLog.slice(-this.maxAlertLogSize);
    }
  }

  /**
   * Clear alert log
   */
  clearAlertLog(): void {
    this.alertLog = [];
  }

  /**
   * Subscribe to stats updates
   */
  onStats(callback: (stats: NodeStats[]) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Subscribe to alert updates
   */
  onAlerts(callback: (alerts: AlertEntry[]) => void): () => void {
    this.alertCallbacks.push(callback);
    return () => {
      this.alertCallbacks = this.alertCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Notify all subscribers of new stats
   */
  private notifySubscribers(stats: NodeStats[]): void {
    for (const callback of this.callbacks) {
      try {
        callback(stats);
      } catch (error) {
        console.error('[ESMonitor] Error in stats callback:', error);
      }
    }
  }

  /**
   * Notify all subscribers of new alerts
   */
  private notifyAlertSubscribers(alerts: AlertEntry[]): void {
    for (const callback of this.alertCallbacks) {
      try {
        callback(alerts);
      } catch (error) {
        console.error('[ESMonitor] Error in alert callback:', error);
      }
    }
  }

  /**
   * Check if monitoring is active
   */
  isActive(): boolean {
    return this.isPolling;
  }
}

// Export singleton instance
export const esMonitor = new ESMonitor();

/**
 * Start monitoring (returns unsubscribe functions)
 */
export async function startESMonitoring(
  onStats?: (stats: NodeStats[]) => void,
  onAlerts?: (alerts: AlertEntry[]) => void
): Promise<{ unsubscribeStats: () => void; unsubscribeAlerts: () => void }> {
  if (!esMonitor.isActive()) {
    esMonitor.startPolling(3000);
  }

  const unsubscribeStats = onStats ? esMonitor.onStats(onStats) : () => {};
  const unsubscribeAlerts = onAlerts ? esMonitor.onAlerts(onAlerts) : () => {};

  return { unsubscribeStats, unsubscribeAlerts };
}

/**
 * Stop monitoring
 */
export function stopESMonitoring(): void {
  esMonitor.stopPolling();
}
