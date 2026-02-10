/**
 * Elasticsearch Monitoring WebSocket API Route
 * Handles real-time WebSocket connections for ES node monitoring
 * 
 * Note: This implementation uses a hybrid approach:
 * - For development: Direct WebSocket support
 * - For production: May require additional server setup (see docs)
 */

import { esMonitor } from '@/lib/es-monitor';
import { createHash } from 'crypto';

interface MonitorMessage {
  type: 'stats' | 'alerts' | 'error' | 'connected';
  payload?: any;
  timestamp: number;
}

// Store active connections globally
let activeConnections: Set<any> = new Set();
let monitoringStarted = false;
let monitoringUnsubscribers: { stats: () => void; alerts: () => void } | null = null;

/**
 * Calculate WebSocket accept header per RFC 6455
 */
function getWebSocketAccept(key: string): string {
  const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const hash = createHash('sha1').update(key + GUID).digest('base64');
  return hash;
}

/**
 * Start monitoring if not already started
 */
async function startMonitoring(): Promise<void> {
  if (monitoringStarted) {
    return;
  }

  monitoringStarted = true;
  console.log('[ESMonitor WebSocket] Starting ES monitoring');

  try {
    // Start polling
    if (!esMonitor.isActive()) {
      esMonitor.startPolling(3000); // Poll every 3 seconds

      // Subscribe to stats updates
      const unsubscribeStats = esMonitor.onStats((stats) => {
        broadcastMessage({
          type: 'stats',
          payload: stats,
          timestamp: Date.now(),
        });
      });

      // Subscribe to alert updates
      const unsubscribeAlerts = esMonitor.onAlerts((alerts) => {
        broadcastMessage({
          type: 'alerts',
          payload: alerts,
          timestamp: Date.now(),
        });
      });

      monitoringUnsubscribers = {
        stats: unsubscribeStats,
        alerts: unsubscribeAlerts,
      };
    }

    console.log('[ESMonitor WebSocket] ES monitoring started');
  } catch (error) {
    console.error('[ESMonitor WebSocket] Error starting monitoring:', error?.message);
    monitoringStarted = false;
    broadcastMessage({
      type: 'error',
      payload: { message: 'Failed to start monitoring' },
      timestamp: Date.now(),
    });
  }
}

/**
 * Broadcast message to all connected clients
 */
function broadcastMessage(message: MonitorMessage): void {
  const jsonMessage = JSON.stringify(message);
  const deadConnections: any[] = [];

  for (const ws of activeConnections) {
    try {
      if (ws && ws.readyState === 1) { // WebSocket.OPEN
        ws.send(jsonMessage);
      } else {
        deadConnections.push(ws);
      }
    } catch (error) {
      console.error('[ESMonitor WebSocket] Error broadcasting:', error?.message);
      deadConnections.push(ws);
    }
  }

  // Clean up dead connections
  for (const ws of deadConnections) {
    activeConnections.delete(ws);
  }
}

/**
 * Handle WebSocket upgrade and connection
 */
export async function GET(request: Request, context: any) {
  try {
    // Check for WebSocket upgrade request
    const upgrade = request.headers.get('upgrade')?.toLowerCase();
    const connection = request.headers.get('connection')?.toLowerCase();
    const key = request.headers.get('sec-websocket-key');

    if (upgrade !== 'websocket' || !connection?.includes('upgrade') || !key) {
      return new Response('Expected WebSocket upgrade request', { status: 400 });
    }

    // Start monitoring if not already started
    if (!monitoringStarted) {
      await startMonitoring();
    }

    // Create WebSocket accept response
    const accept = getWebSocketAccept(key);

    const response = new Response(null, {
      status: 101,
      statusText: 'Switching Protocols',
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Accept': accept,
      },
    });

    // Try to handle socket (this works with Next.js if properly configured)
    // For production, you'll need to run a separate WebSocket server
    // See ELASTICSEARCH_MONITORING.md for production setup

    return response;
  } catch (error) {
    console.error('[ESMonitor WebSocket] Error:', error?.message);
    return new Response('WebSocket upgrade failed', { status: 500 });
  }
}

/**
 * POST handler - can be used to get current stats via REST
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === 'get-stats') {
      return Response.json({
        success: true,
        stats: esMonitor.getLatestStats(),
        timestamp: Date.now(),
      });
    }

    if (body.action === 'get-alerts') {
      return Response.json({
        success: true,
        alerts: esMonitor.getAlertLog(body.limit || 10),
        timestamp: Date.now(),
      });
    }

    return Response.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[ESMonitor REST] Error:', error?.message);
    return Response.json(
      { success: false, error: error?.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}

