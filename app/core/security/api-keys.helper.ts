/**
 * API Keys Helper
 * Manages API key/secret pairs for authentication
 * Supports multiple keys and key rotation
 */

import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('api-keys');

/**
 * API Key configuration
 */
export interface ApiKeyConfig {
  key: string;
  secret: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  createdAt?: string;
  lastUsedAt?: string;
}

/**
 * In-memory store for API keys
 * In production, consider using a database or secure key management service
 */
const apiKeysStore: Map<string, ApiKeyConfig> = new Map();

/**
 * Load API keys from environment variables
 * Supports multiple keys with format: API_KEY_<ID>=<key>:<secret>
 * Example: API_KEY_1=mykey:mysecret, API_KEY_2=anotherkey:anothersecret
 */
export function loadApiKeysFromEnv(): void {
  // Load primary API key from environment (optional - won't throw if not set)
  const primaryKey = process.env.API_KEY || '';
  const primarySecret = process.env.API_SECRET || '';

  if (primaryKey && primarySecret) {
    addApiKey({
      key: primaryKey,
      secret: primarySecret,
      name: 'Primary API Key',
      enabled: true,
    });
    logger.info('Loaded primary API key from environment');
  }

  // Add default development/sandbox credentials for easy local development
  // Only in non-production environments
  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (isDevelopment) {
    const devKey = '35353535353535353535353535353535';
    const devSecret = '35353535353535353535353535353535';
    
    addApiKey({
      key: devKey,
      secret: devSecret,
      name: 'Development/Sandbox Default Key',
      enabled: true,
    });
    logger.info('Loaded default development API key (3535...)');
  }

  // Load additional API keys
  let keyIndex = 1;
  while (true) {
    const envKey = `API_KEY_${keyIndex}`;
    const keyValue = process.env[envKey];
    
    if (!keyValue) {
      break;
    }

    // Format: key:secret or just key (secret in separate env var)
    const parts = keyValue.split(':');
    let key: string;
    let secret: string;

    if (parts.length === 2) {
      [key, secret] = parts;
    } else {
      key = keyValue;
      const secretKey = `API_SECRET_${keyIndex}`;
      secret = process.env[secretKey] || '';
    }

    if (key && secret) {
      addApiKey({
        key,
        secret,
        name: `API Key ${keyIndex}`,
        enabled: true,
      });
      logger.info(`Loaded API key ${keyIndex} from environment`);
    }

    keyIndex++;
  }

  logger.info(`Loaded ${apiKeysStore.size} API key(s) from environment`);
}

/**
 * Add an API key to the store
 * 
 * @param config - API key configuration
 */
export function addApiKey(config: ApiKeyConfig): void {
  if (!config.key || !config.secret) {
    throw new Error('API key and secret are required');
  }

  if (config.secret.length < 32) {
    logger.warn('API secret is shorter than recommended minimum (32 characters)', {
      key: config.key,
      secretLength: config.secret.length,
    });
  }

  apiKeysStore.set(config.key, {
    ...config,
    enabled: config.enabled !== false,
    createdAt: config.createdAt || new Date().toISOString(),
  });

  logger.debug('Added API key', {
    key: config.key,
    name: config.name,
    enabled: config.enabled,
  });
}

/**
 * Get API key configuration by key
 * 
 * @param apiKey - API key to look up
 * @returns API key configuration or null if not found
 */
export function getApiKey(apiKey: string): ApiKeyConfig | null {
  const config = apiKeysStore.get(apiKey);
  
  if (!config) {
    return null;
  }

  if (!config.enabled) {
    logger.warn('API key is disabled', { key: apiKey });
    return null;
  }

  // Update last used timestamp
  config.lastUsedAt = new Date().toISOString();

  return config;
}

/**
 * Get API secret by key
 * 
 * @param apiKey - API key to look up
 * @returns API secret or null if not found
 */
export function getApiSecret(apiKey: string): string | null {
  const config = getApiKey(apiKey);
  return config ? config.secret : null;
}

/**
 * Check if an API key exists and is enabled
 * 
 * @param apiKey - API key to check
 * @returns true if key exists and is enabled
 */
export function isValidApiKey(apiKey: string): boolean {
  return getApiKey(apiKey) !== null;
}

/**
 * List all API keys (without secrets)
 * 
 * @returns Array of API key configurations (secrets are redacted)
 */
export function listApiKeys(): Omit<ApiKeyConfig, 'secret'>[] {
  return Array.from(apiKeysStore.values()).map(({ secret, ...rest }) => ({
    ...rest,
    secret: '***REDACTED***',
  }));
}

/**
 * Remove an API key
 * 
 * @param apiKey - API key to remove
 * @returns true if key was removed, false if not found
 */
export function removeApiKey(apiKey: string): boolean {
  const removed = apiKeysStore.delete(apiKey);
  if (removed) {
    logger.info('Removed API key', { key: apiKey });
  }
  return removed;
}

/**
 * Disable an API key
 * 
 * @param apiKey - API key to disable
 * @returns true if key was disabled, false if not found
 */
export function disableApiKey(apiKey: string): boolean {
  const config = apiKeysStore.get(apiKey);
  if (!config) {
    return false;
  }

  config.enabled = false;
  logger.info('Disabled API key', { key: apiKey });
  return true;
}

/**
 * Enable an API key
 * 
 * @param apiKey - API key to enable
 * @returns true if key was enabled, false if not found
 */
export function enableApiKey(apiKey: string): boolean {
  const config = apiKeysStore.get(apiKey);
  if (!config) {
    return false;
  }

  config.enabled = true;
  logger.info('Enabled API key', { key: apiKey });
  return true;
}

// Initialize API keys from environment on module load
loadApiKeysFromEnv();

