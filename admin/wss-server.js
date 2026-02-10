/**
 * Production-ready WebSocket Server for Elasticsearch Monitoring
 * Usage: node wss-server.js
 */

import { WebSocketServer } from 'ws';
import https from 'https';
import fs from 'fs';
import { Client } from '@elastic/elasticsearch';
import dotenv from 'dotenv';
dotenv.config();

const WS_PORT = process.env.WS_PORT || 3001;
const ES_HOST = process.env.ELASTICSEARCH_HOST;
const ES_USERNAME = process.env.ELASTICSEARCH_USERNAME;
const ES_PASSWORD = process.env.ELASTICSEARCH_PASSWORD;

const TLS_KEY = process.env.WS_TLS_KEY;
const TLS_CERT = process.env.WS_TLS_CERT;
const WS_AUTH_TOKEN = process.env.WS_AUTH_TOKEN; // simple token-based auth

const POLL_INTERVAL = parseInt(process.env.ES_POLL_INTERVAL) || 5000;
const MAX_ALERTS = parseInt(process.env.WS_MAX_ALERTS) || 1000;

const THRESHOLDS = {
  CPU: parseInt(process.env.ES_THRESHOLDS_CPU) || 80,
  HEAP: parseInt(process.env.ES_THRESHOLDS_HEAP) || 80,
  RAM: parseInt(process.env.ES_THRESHOLDS_MEMORY) || 80,
  DISK: parseInt(process.env.ES_THRESHOLDS_DISK) || 80,
};

let esClient;
let wss;
let pollInterval;
let lastNodeStats = new Map();
let alertLog = [];

/**
 * Initialize Elasticsearch client with TLS verification and retries
 */
async function initES() {
  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const options = { node: ES_HOST, requestTimeout: 30000 };
      if (ES_USERNAME && ES_PASSWORD) {
        options.auth = { username: ES_USERNAME, password: ES_PASSWORD };
      }

      if (process.env.ELASTICSEARCH_CA_CERT_PATH) {
        options.tls = {
          rejectUnauthorized: true,
          ca: process.env.ELASTICSEARCH_CA_CERT_PATH ? fs.readFileSync(process.env.ELASTICSEARCH_CA_CERT_PATH) : undefined,
        }
      }

      esClient = new Client(options);
      await esClient.ping();
      console.log('[WSS] ✓ Connected to Elasticsearch');
      return;
    } catch (error) {
      attempt++;
      console.warn(`[WSS] Attempt ${attempt}/${maxRetries} failed:`, error.message);
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 5000));
      else process.exit(1);
    }
  }
}

/**
 * Extract metrics
 */
function extractNodeMetrics(nodeId, nodeName, node) {
  const cpu = node.os?.cpu?.percent || 0;
  const heapUsedPercent = ((node.jvm?.mem?.heap_used_in_bytes || 0) / (node.jvm?.mem?.heap_max_in_bytes || 1)) * 100;
  const ramUsedPercent = ((node.os?.mem?.used_in_bytes || 0) / (node.os?.mem?.total_in_bytes || 1)) * 100;
  const diskUsedPercent = node.fs?.total
    ? ((node.fs.total.total_in_bytes - node.fs.total.available_in_bytes) / node.fs.total.total_in_bytes) * 100
    : 0;

  return {
    nodeId,
    nodeName,
    cpu: Math.round(cpu * 100) / 100,
    heapUsedPercent: Math.round(heapUsedPercent * 100) / 100,
    ramUsedPercent: Math.round(ramUsedPercent * 100) / 100,
    diskUsedPercent: Math.round(diskUsedPercent * 100) / 100,
    timestamp: Date.now(),
    alerts: [],
  };
}

/**
 * Check thresholds and create alerts
 */
function checkThresholds(stats, nodeId, nodeName) {
  const alerts = [];
  if (stats.cpu > THRESHOLDS.CPU) alerts.push({ nodeId, nodeName, type: 'cpu', value: stats.cpu });
  if (stats.heapUsedPercent > THRESHOLDS.HEAP) alerts.push({ nodeId, nodeName, type: 'heap', value: stats.heapUsedPercent });
  if (stats.ramUsedPercent > THRESHOLDS.RAM) alerts.push({ nodeId, nodeName, type: 'ram', value: stats.ramUsedPercent });
  if (stats.diskUsedPercent > THRESHOLDS.DISK) alerts.push({ nodeId, nodeName, type: 'disk', value: stats.diskUsedPercent });
  return alerts;
}

/**
 * Poll Elasticsearch
 */
async function pollElasticsearch() {
  try {
    const response = await esClient.nodes.stats({ metric: ['os', 'jvm', 'fs'] });
    const stats = [];
    const newAlerts = [];

    for (const [nodeId, nodeInfo] of Object.entries(response.nodes || {})) {
      const nodeName = nodeInfo.name || nodeId;
      const nodeStats = extractNodeMetrics(nodeId, nodeName, nodeInfo);
      const alerts = checkThresholds(nodeStats, nodeId, nodeName);
      nodeStats.alerts = alerts.map(a => a.type);
      stats.push(nodeStats);

      for (const alert of alerts) {
        newAlerts.push(alert);
        alertLog.push(alert);
        if (alertLog.length > MAX_ALERTS) alertLog.shift();
      }

      lastNodeStats.set(nodeId, nodeStats);
    }

    broadcast({ type: 'stats', payload: stats });
    if (newAlerts.length) broadcast({ type: 'alerts', payload: newAlerts });

  } catch (error) {
    console.error('[WSS] Polling error:', error.message);
    broadcast({ type: 'error', payload: { message: error.message } });
  }
}

/**
 * Broadcast message to all clients
 */
function broadcast(message) {
  const msgStr = JSON.stringify({ ...message, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msgStr);
  });
}

/**
 * Initialize WebSocket server with TLS and auth
 */
async function initWebSocketServer() {
  if (!TLS_KEY || !TLS_CERT) throw new Error('TLS_KEY and TLS_CERT must be set');

  const server = https.createServer({
    key: fs.readFileSync(TLS_KEY),
    cert: fs.readFileSync(TLS_CERT),
  });

  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    // Simple token-based auth
    const token = req.headers['sec-websocket-protocol'];
    if (WS_AUTH_TOKEN && token !== WS_AUTH_TOKEN) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    ws.send(JSON.stringify({ type: 'connected', stats: Array.from(lastNodeStats.values()), alerts: alertLog.slice(-10) }));

    ws.on('message', data => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'ping') ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        else if (message.type === 'get-stats') ws.send(JSON.stringify({ type: 'stats', payload: Array.from(lastNodeStats.values()) }));
        else if (message.type === 'get-alerts') {
          const limit = message.payload?.limit || 10;
          ws.send(JSON.stringify({ type: 'alerts', payload: alertLog.slice(-limit) }));
        }
      } catch (err) {
        console.error('[WSS] Message error:', err.message);
      }
    });

    ws.on('close', () => console.log('[WSS] Client disconnected'));
    ws.on('error', err => console.error('[WSS] WS error:', err.message));
  });

  server.listen(WS_PORT, () => console.log(`[WSS] Secure WebSocket server running on port ${WS_PORT}`));
}

/**
 * Start polling loop
 */
function startPolling() {
  pollElasticsearch();
  pollInterval = setInterval(pollElasticsearch, POLL_INTERVAL);
  console.log(`[WSS] Polling Elasticsearch every ${POLL_INTERVAL}ms`);
}

/**
 * Graceful shutdown
 */
function gracefulShutdown() {
  console.log('[WSS] Shutting down...');
  if (pollInterval) clearInterval(pollInterval);
  if (wss) wss.close(() => console.log('[WSS] WS server closed'));
  if (esClient) esClient.close().then(() => process.exit(0));
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

/**
 * Main
 */
async function main() {
  try {
    console.log('[WSS] Starting server...');
    await initES();
    await initWebSocketServer();
    startPolling();
  } catch (error) {
    console.error('[WSS] Fatal startup error:', error.message);
    process.exit(1);
  }
}

main();
