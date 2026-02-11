/**
 * Production-ready WebSocket Server for Elasticsearch Monitoring
 * Usage: node wss-server.js
 */

import { WebSocketServer } from 'ws';
import https from 'https';
import http from 'http';
import fs from 'fs';
import { Client } from '@elastic/elasticsearch';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const WS_PORT = process.env.WS_PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ES_HOST = process.env.ELASTICSEARCH_HOST;
const ES_USERNAME = process.env.ELASTICSEARCH_USERNAME;
const ES_PASSWORD = process.env.ELASTICSEARCH_PASSWORD;
const ES_CA_CERT_PATH = process.env.ELASTICSEARCH_CA_CERT_PATH;
const ES_REJECT_UNAUTHORIZED = (process.env.ELASTICSEARCH_REJECT_UNAUTHORIZED || 'true').toLowerCase() === 'true';
const ES_PING_TIMEOUT = parseInt(process.env.ELASTICSEARCH_PING_TIMEOUT) || 5000;
const ES_REQUEST_TIMEOUT = parseInt(process.env.ELASTICSEARCH_REQUEST_TIMEOUT) || 30000;
const ES_MAX_RETRIES = parseInt(process.env.ELASTICSEARCH_MAX_RETRIES) || 3;

const TLS_KEY = process.env.WS_TLS_KEY;
const TLS_CERT = process.env.WS_TLS_CERT;
const TLS_PFX = process.env.WS_TLS_PFX;
const TLS_PFX_PASSPHRASE = process.env.WS_TLS_PFX_PASSPHRASE;
const WS_ALLOW_INSECURE = (process.env.WS_ALLOW_INSECURE || 'false').toLowerCase() === 'true';
const WS_AUTH_TOKEN = process.env.WS_AUTH_TOKEN; // simple token-based auth
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const WS_ACCEPT_JWT = (process.env.WS_ACCEPT_JWT || 'true').toLowerCase() === 'true';
const WS_REQUIRE_AUTH = (process.env.WS_REQUIRE_AUTH || (NODE_ENV === 'production' ? 'true' : 'false')).toLowerCase() === 'true';
const WS_ALLOWED_ORIGINS = (process.env.WS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const WS_MAX_PAYLOAD = parseInt(process.env.WS_MAX_PAYLOAD) || 1024 * 1024;
const WS_HEADERS_TIMEOUT = parseInt(process.env.WS_HEADERS_TIMEOUT) || 15000;
const WS_KEEPALIVE_TIMEOUT = parseInt(process.env.WS_KEEPALIVE_TIMEOUT) || 5000;
const WS_REQUEST_TIMEOUT = parseInt(process.env.WS_REQUEST_TIMEOUT) || 0;

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
  const maxRetries = ES_MAX_RETRIES || 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      if (!ES_HOST) throw new Error('ELASTICSEARCH_HOST is not set');

      console.log(`[WSS] Connecting to Elasticsearch at ${ES_HOST}`);
      if (ES_CA_CERT_PATH) {
        console.log(`[WSS] Using CA cert at ${ES_CA_CERT_PATH} (rejectUnauthorized=${ES_REJECT_UNAUTHORIZED})`);
      } else {
        console.log('[WSS] No CA cert configured');
      }

      const options = { node: ES_HOST, requestTimeout: ES_REQUEST_TIMEOUT };
      if (ES_USERNAME && ES_PASSWORD) {
        options.auth = { username: ES_USERNAME, password: ES_PASSWORD };
      }

      if (ES_CA_CERT_PATH) {
        options.tls = {
          rejectUnauthorized: ES_REJECT_UNAUTHORIZED,
          ca: fs.readFileSync(ES_CA_CERT_PATH),
        };
      }

      esClient = new Client(options);
      const info = await esClient.info({}, { requestTimeout: ES_PING_TIMEOUT });
      const version = info?.version?.number ? ` (v${info.version.number})` : '';
      console.log(`[WSS] ✓ Connected to Elasticsearch${version}`);
      return;
    } catch (error) {
      attempt++;
      console.warn(`[WSS] Attempt ${attempt}/${maxRetries} failed:`, error?.message || error);
      if (error?.name) console.warn('[WSS] Error name:', error.name);
      if (error?.code) console.warn('[WSS] Error code:', error.code);
      if (error?.meta?.body) console.warn('[WSS] ES response body:', JSON.stringify(error.meta.body));
      if (error?.meta?.headers) console.warn('[WSS] ES response headers:', JSON.stringify(error.meta.headers));
      if (error?.stack) console.warn('[WSS] Stack:', error.stack);
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
  if (!WS_ALLOW_INSECURE && !TLS_PFX && (!TLS_KEY || !TLS_CERT)) {
    throw new Error('TLS_KEY and TLS_CERT must be set (or WS_TLS_PFX must be provided)');
  }
  if (WS_REQUIRE_AUTH && !WS_AUTH_TOKEN) throw new Error('WS_AUTH_TOKEN must be set when WS_REQUIRE_AUTH=true');

  const server = WS_ALLOW_INSECURE
    ? http.createServer()
    : TLS_PFX
      ? https.createServer({
          pfx: fs.readFileSync(TLS_PFX),
          passphrase: TLS_PFX_PASSPHRASE,
        })
      : https.createServer({
          key: fs.readFileSync(TLS_KEY),
          cert: fs.readFileSync(TLS_CERT),
        });

  server.headersTimeout = WS_HEADERS_TIMEOUT;
  server.keepAliveTimeout = WS_KEEPALIVE_TIMEOUT;
  if (WS_REQUEST_TIMEOUT > 0) server.requestTimeout = WS_REQUEST_TIMEOUT;

  wss = new WebSocketServer({
    server,
    maxPayload: WS_MAX_PAYLOAD,
    perMessageDeflate: false,
  });

  wss.on('connection', (ws, req) => {
    // Optional origin allowlist
    if (WS_ALLOWED_ORIGINS.length) {
      const origin = req.headers.origin || '';
      if (!WS_ALLOWED_ORIGINS.includes(origin)) {
        ws.close(1008, 'Origin not allowed');
        return;
      }
    }

    // Simple token-based auth (static token or short-lived JWT)
    const tokenHeader = req.headers['sec-websocket-protocol'];
    const tokenList = typeof tokenHeader === 'string'
      ? tokenHeader.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const hasValidToken = tokenList.some((token) => {
      if (WS_AUTH_TOKEN && token === WS_AUTH_TOKEN) return true;
      if (WS_ACCEPT_JWT && JWT_SECRET) {
        try {
          const payload = jwt.verify(token, JWT_SECRET);
          return payload && payload.type === 'ws';
        } catch {
          return false;
        }
      }
      return false;
    });

    if (WS_REQUIRE_AUTH && !hasValidToken) {
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

  const protocolLabel = WS_ALLOW_INSECURE ? 'ws' : 'wss';
  server.listen(WS_PORT, () => console.log(`[WSS] ${protocolLabel} server running on port ${WS_PORT}`));
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
process.on('unhandledRejection', err => {
  console.error('[WSS] Unhandled rejection:', err?.message || err);
});
process.on('uncaughtException', err => {
  console.error('[WSS] Uncaught exception:', err?.message || err);
  gracefulShutdown();
});

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
