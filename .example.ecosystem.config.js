/**
 * PM2 Ecosystem Configuration File
 */
const path = require("path");
const rootDir = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: "server",
      script: path.resolve(rootDir, "app/dist/index.js"),
      cwd: path.resolve(rootDir, "app"),
      exec_mode: "cluster",
      instances: 1,
      env_file: path.resolve(rootDir, "app/.env"),
      env: {
        NODE_ENV: "production",
        PORT: 3555
      },
      error_file: path.resolve(rootDir, "logs/server-error.log"),
      out_file: path.resolve(rootDir, "logs/server-out.log"),
      log_file: path.resolve(rootDir, "logs/server-combined.log"),
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "16G",
      merge_logs: true,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: "dashboard",
      cwd: path.resolve(rootDir, "dashboard"),
      script: "node_modules/.bin/react-router-serve",
      args: path.resolve(rootDir, "dashboard/build/server/index.js"),
      exec_mode: "fork", // Remix only works in fork model
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3556,
        LEGACY_APP_URL: 'https://fdstaging.digitalcoo.co',
        SHOPIFY_APP_URL: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        SHOPIFY_API_KEY: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        SHOPIFY_API_SECRET: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        SCOPES: 'read_locales,read_online_store_pages,read_products,read_themes,write_online_store_pages,write_products',
        GRAPHQL_ENDPOINT: '/graphql',
        API_KEY: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        API_SECRET: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        SENDGRID_API_KEY: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        APP_EMAIL_FROM: 'support@xxxxxxx.com',
        APP_EMAIL_NAME: 'XXXXXXXXXXXXXXX',
        APP_SUPPORT_EMAIL: 'support@xxxxxxx.com'
      },
      error_file: path.resolve(rootDir, "logs/dashboard-error.log"),
      out_file: path.resolve(rootDir, "logs/dashboard-out.log"),
      log_file: path.resolve(rootDir, "logs/dashboard-combined.log"),
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "16G",
      merge_logs: true,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    }
  ]
};
