/**
 * System Resource Monitor Route
 * GET /system/monitor
 * Returns current system resource usage (CPU, Memory)
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { SystemMonitor } from '@core/utils/system-monitor.util';

export const GET = handler(async (req: HttpRequest) => {
  try {
    const system = new SystemMonitor();

    // Start monitoring briefly to get current stats
    system.start(100);

    // Wait a moment for first reading
    await new Promise((resolve) => setTimeout(resolve, 200));

    const usage = { ...system.usage };
    system.stop();

    return {
      status: 'ok',
      resources: {
        cpu: {
          percent: parseFloat(usage.cpuPercent.toFixed(2)),
          status:
            usage.cpuPercent > 85
              ? 'high'
              : usage.cpuPercent > 70
                ? 'warning'
                : 'normal',
        },
        memory: {
          percent: parseFloat(usage.memoryPercent.toFixed(2)),
          used: usage.memoryUsed,
          total: usage.memoryTotal,
          status:
            usage.memoryPercent > 85
              ? 'high'
              : usage.memoryPercent > 70
                ? 'warning'
                : 'normal',
        },
        overall: {
          status: usage.isHigh ? 'high' : 'normal',
          threshold: {
            cpu: 85,
            memory: 85,
          },
        },
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      status: 'error',
      error: error.message || 'Failed to get system resources',
      timestamp: new Date().toISOString(),
    };
  }
});
