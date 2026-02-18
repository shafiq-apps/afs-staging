/**
 * Application Entry Point
 * Loads environment variables first, then bootstraps the application
 */

import { initEnv } from '@core/config/env.loader';
import { bootstrap } from '@core/bootstrap/main';
import { loadApiKeysFromEnv } from '@core/security/api-keys.helper';

// Load environment variables as early as possible
initEnv();
loadApiKeysFromEnv();

// Bootstrap and start the application
bootstrap().catch((error) => {
  console.error('Failed to bootstrap application:', error);
  process.exit(1);
});
