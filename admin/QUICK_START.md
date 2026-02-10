# Elasticsearch Monitoring - Quick Start Guide

## 📋 Overview

This guide helps you quickly set up and run the real-time Elasticsearch monitoring system.

## 🚀 Installation & Setup

### Step 1: Install Dependencies

```bash
cd admin
npm install
```

This installs:
- `ws@8.16.0` - WebSocket library
- `@types/ws@8.5.10` - TypeScript types for ws

### Step 2: Verify Elasticsearch Connection

Ensure Elasticsearch is running and accessible:

```bash
# Test connection
curl http://localhost:9200

# You should see:
# {
#   "name" : "node-1",
#   "cluster_name" : "elasticsearch",
#   ...
# }
```

### Step 3: Set Environment Variables (Optional)

If your Elasticsearch instance requires authentication or is on a different host:

```bash
# Linux/macOS
export ELASTICSEARCH_HOST=http://your-es-host:9200
export ELASTICSEARCH_USERNAME=elastic
export ELASTICSEARCH_PASSWORD=your-password

# Windows PowerShell
$env:ELASTICSEARCH_HOST="http://your-es-host:9200"
$env:ELASTICSEARCH_USERNAME="elastic"
$env:ELASTICSEARCH_PASSWORD="your-password"
```

## 🏃 Running the System

### Development Setup

**Terminal 1: Start Next.js Dev Server**
```bash
cd admin
npm run dev
```

Output should show:
```
  ▲ Next.js 16.1.4
  - Local:        http://localhost:3000
  - Environments: .env.local
```

**Terminal 2: Start WebSocket Server**
```bash
cd admin
node wss-server.js
```

Output should show:
```
[WSS] Initializing Elasticsearch Monitoring WebSocket Server...
[WSS] ES Host: http://localhost:9200
[WSS] WS Port: 3001
[WSS] Connected to Elasticsearch: http://localhost:9200
[WSS] WebSocket server listening on port 3001
[WSS] Started polling Elasticsearch every 3 seconds
[WSS] Server ready and monitoring
```

### Access the Dashboard

Open your browser and navigate to:
```
http://localhost:3000/monitoring
```

You should see:
- ✅ Connection status showing "Connected" in green
- 📊 Node Statistics table with real-time metrics
- ⚠️ Alert Log (empty if all metrics are normal)
- 📖 Threshold Information

## 🔍 Verification Checklist

After starting both servers, verify:

- [ ] Next.js dev server is running on `http://localhost:3000`
- [ ] WebSocket server is running on port `3001`
- [ ] Elasticsearch is accessible and responding
- [ ] Dashboard loads at `http://localhost:3000/monitoring`
- [ ] Connection status shows "Connected"
- [ ] Node statistics table displays data
- [ ] Data updates every 3 seconds

## 📊 Testing the Monitoring

### 1. View Real-Time Stats

Stats update every 3 seconds automatically. You'll see:
```
┌─────────────────┬─────────┬─────────┬─────────┬─────────────────┐
│ Node Name       │ CPU %   │ Heap %  │ RAM %   │ Disk %          │
├─────────────────┼─────────┼─────────┼─────────┼─────────────────┤
│ es-node-1       │ 15.23   │ 45.67   │ 62.34   │ 78.90           │
└─────────────────┴─────────┴─────────┴─────────┴─────────────────┘
```

### 2. Trigger an Alert

To test alerts, temporarily stress test your Elasticsearch node:

```bash
# Generate some CPU load on Elasticsearch
curl -X GET "localhost:9200/_search?size=10000" -H 'Content-Type: application/json' \
  -d'{"query":{"match_all":{}}}'
```

If metrics exceed thresholds:
- ❌ Metrics cells turn red
- 📋 Alert appears in the Alert Log table
- 💾 Alert is automatically logged to disk

### 3. Check Alert Logs

**REST API to retrieve alerts:**

```bash
# Today's alerts
curl http://localhost:3000/api/monitor/alerts

# Statistics for today
curl "http://localhost:3000/api/monitor/alerts?action=stats&date=2024-02-10"

# Alerts by type (cpu, heap, ram, disk)
curl "http://localhost:3000/api/monitor/alerts?action=type&alertType=cpu&limit=10"

# Alerts for specific date range
curl "http://localhost:3000/api/monitor/alerts?action=range&startDate=2024-02-01&endDate=2024-02-10"
```

**Alert log files are stored at:**
```
admin/logs/es-alerts/
├── alerts-2024-02-10.jsonl
├── alerts-2024-02-09.jsonl
└── index.json
```

## 🛠️ Troubleshooting

### Problem: "WebSocket connection error"

**Solution:** Make sure WebSocket server is running
```bash
# Terminal 2
cd admin
node wss-server.js
```

Check server is on correct port:
```bash
# Linux/macOS
lsof -i :3001

# Windows PowerShell
netstat -ano | findstr :3001
```

### Problem: "Failed to connect to Elasticsearch"

**Solution:** Verify Elasticsearch is running
```bash
# Check if Elasticsearch is up
curl -I http://localhost:9200

# Or check via Docker
docker ps | grep elasticsearch
```

If not running, start Elasticsearch:
```bash
# Docker
docker-compose up elasticsearch

# Or local installation
bin/elasticsearch
```

### Problem: No data appearing in dashboard

**Solution:** Check server logs for errors
- Look for `[ESMonitor]` messages in both server terminals
- Check browser console (F12 → Console tab)
- Verify Elasticsearch is accessible: `curl http://localhost:9200/_nodes/stats`

### Problem: Alert logs not being created

**Solution:** Check directory permissions
```bash
# Ensure logs directory is writable
cd admin
mkdir -p logs/es-alerts
chmod 755 logs/es-alerts
```

## 📁 File Structure

New files created:

```
admin/
├── wss-server.js                              # Standalone WebSocket server
├── ELASTICSEARCH_MONITORING.md                # Full documentation
├── QUICK_START.md                             # This file
├── src/
│   ├── lib/
│   │   ├── es-monitor.ts                      # Monitoring service
│   │   └── alert-logger.ts                    # Alert persistence
│   ├── app/
│   │   ├── api/
│   │   │   └── monitor/
│   │   │       ├── websocket/
│   │   │       │   └── route.ts               # WebSocket API (fallback)
│   │   │       └── alerts/
│   │   │           └── route.ts               # Alert retrieval API
│   │   ├── monitoring/
│   │   │   └── page.tsx                       # Dashboard page
│   │   └── ...
│   ├── components/
│   │   └── ESMonitoring.tsx                   # Dashboard component
│   └── ...
└── logs/
    └── es-alerts/                             # Alert log directory
        ├── alerts-2024-02-10.jsonl
        └── index.json
```

## 🚀 Production Deployment

### Using PM2 (Process Manager)

1. **Create `pm2.config.js`:**

```javascript
module.exports = {
  apps: [
    {
      name: 'next-admin',
      script: 'npm',
      args: 'run start',
      cwd: '/path/to/admin',
      instances: 1,
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'es-monitor-ws',
      script: '/path/to/admin/wss-server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        ELASTICSEARCH_HOST: 'http://elasticsearch:9200',
        ELASTICSEARCH_USERNAME: 'elastic',
        ELASTICSEARCH_PASSWORD: 'your-password',
        WS_PORT: '3001',
      },
    },
  ],
};
```

2. **Run processes:**

```bash
# Install PM2 globally
npm install -g pm2

# Start processes
pm2 start pm2.config.js

# View logs
pm2 logs

# Stop/restart
pm2 stop all
pm2 restart all
pm2 delete all
```

### Using Docker

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  admin:
    build: ./admin
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      ELASTICSEARCH_HOST: http://elasticsearch:9200
    depends_on:
      - elasticsearch

  es-monitor-ws:
    build: ./admin
    command: node wss-server.js
    ports:
      - "3001:3001"
    environment:
      ELASTICSEARCH_HOST: http://elasticsearch:9200
      WS_PORT: 3001
    depends_on:
      - elasticsearch

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.10.0
    environment:
      - discovery.type=single-node
    ports:
      - "9200:9200"
```

## 📞 Support

For issues or questions, check:

1. **Full Documentation:** `ELASTICSEARCH_MONITORING.md`
2. **Server Logs:** Look for `[ESMonitor]` messages
3. **Browser Console:** F12 → Console tab for frontend errors
4. **Elasticsearch Health:** `curl http://localhost:9200/_cluster/health`

## 🎉 Next Steps

After setup:
- [ ] Customize thresholds in `src/lib/es-monitor.ts`
- [ ] Set up monitoring page access controls
- [ ] Configure alert webhooks (future enhancement)
- [ ] Integrate with your monitoring dashboard
- [ ] Set up log rotation for alert files

Happy monitoring! 🚀
