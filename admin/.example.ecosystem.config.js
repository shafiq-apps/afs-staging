/**
 * PM2 Ecosystem Configuration File for Next.js
 *
 * Each app is managed independently.
 * Watch is disabled in production to prevent accidental restarts.
 */
const path = require("path");
const rootDir = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: "admin-panel",
      // Next.js production server
      script: "node_modules/next/dist/server/next-start.js",
      cwd: path.resolve(rootDir, "app"),
      exec_mode: "cluster",
      instances: 1, // set >1 if you want clustering
      env: {
        NODE_ENV: "production",
        PORT: 3557
      },
      env_file: path.resolve(rootDir, "app/.env"),
      error_file: path.resolve(rootDir, "logs/admin-panel-server-error.log"),
      out_file: path.resolve(rootDir, "logs/admin-panel--out.log"),
      log_file: path.resolve(rootDir, "logs/admin-panel--combined.log"),
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "3G",
      merge_logs: true,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    }
  ]
};
