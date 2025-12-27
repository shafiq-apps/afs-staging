/**
 * Environment Loader
 * Loads environment variables from .env files based on NODE_ENV
 * Works in both development (TypeScript) and production (compiled JS in dist)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { createModuleLogger } from '@shared/utils/logger.util';
import { applyLoggerEnvConfig } from '@shared/utils/logger.util';

const logger = createModuleLogger('env-loader', {disabled: true});

export interface EnvLoaderOptions {
  /**
   * Base directory for .env files
   * Defaults to process.cwd() in production, or project root in development
   */
  baseDir?: string;
  /**
   * Environment name (development, staging, production)
   * Defaults to NODE_ENV or 'development'
   */
  env?: string;
  /**
   * Whether to override existing environment variables
   * Defaults to false (existing vars take precedence)
   */
  override?: boolean;
  /**
   * Whether to load .env file in addition to environment-specific file
   * Defaults to true
   */
  loadDefault?: boolean;
}

/**
 * Get the project root directory
 * Works in both development (TypeScript) and production (compiled JS)
 */
function getProjectRoot(): string {
  const cwd = process.cwd();
  
  // Check if we're running from dist/ folder
  // In production, the working directory might be dist/ or the project root
  // We check if dist/ exists in cwd, and if we're inside it
  const distPath = resolve(cwd, 'dist');
  const isInDist = cwd.includes('dist') || existsSync(distPath);
  
  if (isInDist && cwd.endsWith('dist')) {
    // Running from dist/ folder, go up one level
    return resolve(cwd, '..');
  }
  
  // In development or when running from project root
  return cwd;
}

/**
 * Load environment variables from .env files
 */
export function loadEnv(options: EnvLoaderOptions = {}): void {
  const {
    baseDir = getProjectRoot(),
    env = process.env.NODE_ENV || 'development',
    override = false,
    loadDefault = true,
  } = options;

  logger.info('Loading environment variables', {
    baseDir,
    env,
    override,
    loadDefault,
  });

  // Load default .env file first (if enabled)
  if (loadDefault) {
    const defaultEnvPath = resolve(baseDir, '.env');
    if (existsSync(defaultEnvPath)) {
      const result = config({ path: defaultEnvPath, override });
      if (result.error) {
        logger.warn('Failed to load .env file', result.error.message);
      } else {
        logger.info('Loaded .env file');
      }
    } else {
      logger.debug('.env file not found, skipping');
    }
  }

  // Load environment-specific .env file
  const envFilePath = resolve(baseDir, `.env.${env}`);
  if (existsSync(envFilePath)) {
    const result = config({ path: envFilePath, override });
    if (result.error) {
      logger.warn(`Failed to load .env.${env} file`, result.error.message);
    } else {
      logger.info(`Loaded .env.${env} file`);
    }
  } else {
    logger.debug(`.env.${env} file not found, skipping`);
  }

  // Log loaded environment (without sensitive data)
  logger.info('Environment loaded', {
    NODE_ENV: process.env.NODE_ENV,
    env,
    nodeEnv: process.env.NODE_ENV,
  });
}

/**
 * Get environment name
 */
export function getEnv(): string {
  return process.env.NODE_ENV || 'development';
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return getEnv() === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return getEnv() === 'development';
}

/**
 * Check if running in staging
 */
export function isStaging(): boolean {
  return getEnv() === 'staging';
}

/**
 * Get environment variable with fallback
 */
export function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined || value === null) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Get environment variable as number
 */
export function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined || value === null) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is not set`);
  }
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is not a valid number: ${value}`);
  }
  return num;
}

/**
 * Get environment variable as boolean
 */
export function getEnvBoolean(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === null) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return false;
  }
  const lowerValue = value.toLowerCase().trim();
  return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
}

/**
 * Initialize environment loading
 * Should be called as early as possible in the application
 */
export function initEnv(options?: EnvLoaderOptions): void {
  loadEnv(options);
  // Apply logger module enable/disable rules after env is loaded.
  applyLoggerEnvConfig();
}

