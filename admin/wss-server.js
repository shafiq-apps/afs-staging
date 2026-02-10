/**
 * Standalone WebSocket Server for Elasticsearch Monitoring
 * Run this alongside the Next.js app for production WebSocket support
 * 
 * Usage:
 * node wss-server.js
 * 
 * Then connect from the frontend to: ws://localhost:3001
 */

import { WebSocketServer } from 'ws';
import http from 'http';
import { Client } from '@elastic/elasticsearch';
import dotenv from 'dotenv';
dotenv.config();

const WS_PORT = process.env.WS_PORT || 3001;
const ES_HOST = process.env.ELASTICSEARCH_HOST || 'https://localhost:9200';
const ES_USERNAME = process.env.ELASTICSEARCH_USERNAME || 'elastic';
const ES_PASSWORD = process.env.ELASTICSEARCH_PASSWORD || 'changeme';

let esClient;
let wss;
let pollInterval;
let lastNodeStats = new Map();
let alertLog = [];

const THRESHOLDS = {
  CPU: parseInt(process.env.ES_THRESHOLDS_CPU) || 80,
  HEAP: parseInt(process.env.ES_THRESHOLDS_HEAP) || 80,
  RAM: parseInt(process.env.ES_THRESHOLDS_MEMORY) || 80,
  DISK: parseInt(process.env.ES_THRESHOLDS_DISK) || 80,
  ES_POLL_INTERVAL: parseInt(process.env.ES_POLL_INTERVAL) || 1000,
};

/**
 * Initialize Elasticsearch client with retries
 */
async function initES() {
  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const options = {
        node: ES_HOST,
        requestTimeout: 30000,
        tls: {
          rejectUnauthorized: false,
        },
      };

      if (ES_USERNAME && ES_PASSWORD) {
        options.auth = {
          username: ES_USERNAME,
          password: ES_PASSWORD,
        };
      }

      esClient = new Client(options);
      await esClient.ping();
      console.log('[WSS] ✓ Connected to Elasticsearch:', ES_HOST);
      return;
    } catch (error) {
      attempt++;
      if (attempt < maxRetries) {
        console.warn(
          `[WSS] Connection attempt ${attempt}/${maxRetries} failed. Retrying in 5 seconds...`
        );
        console.warn('[WSS] Error:', error?.message || error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
        console.error('[WSS] ✗ Failed to connect to Elasticsearch after', maxRetries, 'attempts');
        console.error('[WSS] Connection details:');
        console.error('   Host:', ES_HOST);
        console.error('   Auth:', ES_USERNAME ? 'Yes' : 'No');
        console.error('[WSS] Error:', error?.message || error);
        console.error('[WSS] Please ensure:');
        console.error('   1. Elasticsearch is running');
        console.error('   2. ELASTICSEARCH_HOST is correct');
        console.error('   3. For self-signed certs, certificate validation is disabled');
        process.exit(1);
      }
    }
  }
}

/**
 * Extract metrics from node info
 */
function extractNodeMetrics(nodeId, nodeName, node) {
  const cpuPercent = node.os?.cpu?.percent || 0;
  const heapUsedBytes = node.jvm?.mem?.heap_used_in_bytes || 0;
  const heapMaxBytes = node.jvm?.mem?.heap_max_in_bytes || 1;
  const heapUsedPercent = (heapUsedBytes / heapMaxBytes) * 100;
  const osMemUsedBytes = node.os?.mem?.used_in_bytes || 0;
  const osMemTotalBytes = node.os?.mem?.total_in_bytes || 1;
  const ramUsedPercent = (osMemUsedBytes / osMemTotalBytes) * 100;

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
 * Check thresholds and return alerts
 */
function checkThresholds(stats, nodeId, nodeName) {
  const alerts = [];

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
 * Poll Elasticsearch and broadcast updates
 */
async function pollElasticsearch() {
  try {
    const response = await esClient.nodes.stats({
      metric: ['os', 'jvm', 'fs'],
    });

    const nodesData = response.nodes || {};
    const stats = [];
    const newAlerts = [];

    for (const [nodeId, nodeInfo] of Object.entries(nodesData)) {
      const node = nodeInfo;
      const nodeName = node.name || nodeId;
      const nodeStats = extractNodeMetrics(nodeId, nodeName, node);
      const alerts = checkThresholds(nodeStats, nodeId, nodeName);

      nodeStats.alerts = alerts.map((a) => a.alertType);
      stats.push(nodeStats);

      for (const alert of alerts) {
        newAlerts.push(alert);
        alertLog.push(alert);

        if (alertLog.length > 1000) {
          alertLog = alertLog.slice(-1000);
        }
      }

      lastNodeStats.set(nodeId, nodeStats);
    }

    broadcastToAll(
      JSON.stringify({
        type: 'stats',
        payload: stats,
        timestamp: Date.now(),
      })
    );

    if (newAlerts.length > 0) {
      broadcastToAll(
        JSON.stringify({
          type: 'alerts',
          payload: newAlerts,
          timestamp: Date.now(),
        })
      );
    }
  } catch (error) {
    console.error('[WSS] Error polling Elasticsearch:', error?.message || error);
    broadcastToAll(
      JSON.stringify({
        type: 'error',
        payload: { message: error?.message || 'Failed to fetch stats' },
        timestamp: Date.now(),
      })
    );
  }
}

/**
 * Broadcast message to all connected clients
 */
function broadcastToAll(message) {
  const deadClients = [];

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      try {
        client.send(message);
      } catch (error) {
        console.error('[WSS] Error sending to client:', error?.message || error);
        deadClients.push(client);
      }
    } else {
      deadClients.push(client);
    }
  });

  for (const client of deadClients) {
    try {
      client.close();
    } catch (error) {
      // Ignore close errors
    }
  }
}

/**
 * Initialize WebSocket server
 */
async function initWebSocketServer() {
  const server = http.createServer();

  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('[WSS] New client connected. Total clients:', wss.clients.size);

    try {
      ws.send(
        JSON.stringify({
          type: 'connected',
          payload: {
            status: 'connected',
            stats: Array.from(lastNodeStats.values()),
            alerts: alertLog.slice(-10),
          },
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.error('[WSS] Error sending connected message:', error?.message || error);
    }

    ws.on('error', (error) => {
      console.error('[WSS] WebSocket error:', error?.message || error);
    });

    ws.on('close', () => {
      console.log('[WSS] Client disconnected. Remaining:', wss.clients.size - 1);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'ping') {
          ws.send(
            JSON.stringify({
              type: 'pong',
              timestamp: Date.now(),
            })
          );
        } else if (message.type === 'get-stats') {
          ws.send(
            JSON.stringify({
              type: 'stats',
              payload: Array.from(lastNodeStats.values()),
              timestamp: Date.now(),
            })
          );
        } else if (message.type === 'get-alerts') {
          const limit = message.payload?.limit || 10;
          ws.send(
            JSON.stringify({
              type: 'alerts',
              payload: alertLog.slice(-limit),
              timestamp: Date.now(),
            })
          );
        }
      } catch (error) {
        console.error('[WSS] Error handling message:', error?.message || error);
      }
    });
  });

  server.listen(WS_PORT, () => {
    console.log(`[WSS] WebSocket server listening on port ${WS_PORT}`);
  });
}

/**
 * Start polling
 */
function startPolling() {
  pollElasticsearch();

  pollInterval = setInterval(pollElasticsearch, THRESHOLDS.ES_POLL_INTERVAL);
  console.log(`[WSS] Started polling Elasticsearch every ${THRESHOLDS.ES_POLL_INTERVAL}ms`);
}

/**
 * Graceful shutdown
 */
function gracefulShutdown() {
  console.log('[WSS] Shutting down gracefully...');

  if (pollInterval) {
    clearInterval(pollInterval);
  }

  if (wss) {
    wss.close(() => {
      console.log('[WSS] WebSocket server closed');
    });
  }

  if (esClient) {
    esClient.close().then(() => {
      console.log('[WSS] Elasticsearch connection closed');
      process.exit(0);
    });
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

/**
 * Main startup
 */
async function main() {
  try {
    console.log('[WSS] Initializing Elasticsearch Monitoring WebSocket Server...');
    console.log('[WSS] ES Host:', ES_HOST);
    console.log('[WSS] WS Port:', WS_PORT);

    await initES();
    await initWebSocketServer();
    startPolling();

    console.log('[WSS] Server ready and monitoring');
  } catch (error) {
    console.error('[WSS] Fatal error during startup:', error?.message || error);
    process.exit(1);
  }
}

main();
