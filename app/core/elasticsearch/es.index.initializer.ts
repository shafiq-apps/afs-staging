/**
 * Elasticsearch Index Initializer
 * Ensures all static indices exist with proper mappings and settings on application bootstrap
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { STATIC_INDEX_CONFIGS, StaticIndexConfig } from './es.index.config';

const logger = createModuleLogger('es-index-initializer');

export interface IndexInitializationResult {
  index: string;
  created: boolean;
  error?: string;
}

/**
 * Initialize all static Elasticsearch indices
 * Checks if each index exists and creates it with proper mappings and settings if it doesn't
 * 
 * @param esClient - Elasticsearch client instance
 * @returns Array of initialization results for each index
 */
export async function initializeStaticIndices(
  esClient: Client
): Promise<IndexInitializationResult[]> {
  logger.info('Initializing static Elasticsearch indices...', {
    count: STATIC_INDEX_CONFIGS.length,
  });

  const results: IndexInitializationResult[] = [];

  // Process all indices in parallel for faster initialization
  const initializationPromises = STATIC_INDEX_CONFIGS.map(async (config) => {
    return initializeIndex(esClient, config);
  });

  const indexResults = await Promise.allSettled(initializationPromises);

  // Process results
  indexResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      const config = STATIC_INDEX_CONFIGS[index];
      logger.error(`Failed to initialize index: ${config.index}`, {
        error: result.reason?.message || result.reason,
      });
      results.push({
        index: config.index,
        created: false,
        error: result.reason?.message || String(result.reason),
      });
    }
  });

  // Log summary
  const createdCount = results.filter((r) => r.created).length;
  const existingCount = results.filter((r) => !r.created && !r.error).length;
  const errorCount = results.filter((r) => r.error).length;

  logger.info('Static indices initialization completed', {
    total: STATIC_INDEX_CONFIGS.length,
    created: createdCount,
    existing: existingCount,
    errors: errorCount,
  });

  if (errorCount > 0) {
    const errors = results.filter((r) => r.error).map((r) => ({
      index: r.index,
      error: r.error,
    }));
    logger.warn('Some indices failed to initialize', { errors });
  }

  return results;
}

/**
 * Initialize a single index
 * Checks if index exists and creates it with proper mappings and settings if needed
 * 
 * @param esClient - Elasticsearch client instance
 * @param config - Index configuration
 * @returns Initialization result
 */
async function initializeIndex(
  esClient: Client,
  config: StaticIndexConfig
): Promise<IndexInitializationResult> {
  try {
    // Check if index exists
    const exists = await esClient.indices.exists({ index: config.index });

    if (exists) {
      logger.debug(`Index already exists: ${config.index}`);
      
      // Verify and update settings if needed (non-destructive)
      await ensureIndexSettings(esClient, config);
      
      return {
        index: config.index,
        created: false,
      };
    }

    // Create index with mappings and settings
    logger.info(`Creating index: ${config.index}`);
    await esClient.indices.create({
      index: config.index,
      mappings: config.mappings,
      settings: config.settings,
    });

    logger.info(`Index created successfully: ${config.index}`);
    return {
      index: config.index,
      created: true,
    };
  } catch (error: any) {
    // Handle race condition where index might be created concurrently
    if (error?.meta?.body?.error?.type === 'resource_already_exists_exception') {
      logger.debug(`Index already exists (concurrent creation): ${config.index}`);
      return {
        index: config.index,
        created: false,
      };
    }

    logger.error(`Failed to initialize index: ${config.index}`, {
      error: error?.message || error,
      statusCode: error?.meta?.statusCode,
    });

    throw new Error(
      `Failed to initialize index ${config.index}: ${error?.message || error}`
    );
  }
}

/**
 * Ensure index settings are correct
 * Updates settings that can be changed on existing indices (non-destructive)
 * 
 * @param esClient - Elasticsearch client instance
 * @param config - Index configuration
 */
async function ensureIndexSettings(
  esClient: Client,
  config: StaticIndexConfig
): Promise<void> {
  try {
    // Only update settings that can be changed on existing indices
    // Note: number_of_shards cannot be changed after index creation
    // number_of_replicas can be changed
    const updatableSettings: any = {};

    if (config.settings.number_of_replicas !== undefined) {
      updatableSettings.number_of_replicas = config.settings.number_of_replicas;
    }

    if (config.settings.refresh_interval !== undefined) {
      updatableSettings.refresh_interval = config.settings.refresh_interval;
    }

    if (config.settings.index?.mapping?.total_fields?.limit !== undefined) {
      if (!updatableSettings.index) {
        updatableSettings.index = {};
      }
      if (!updatableSettings.index.mapping) {
        updatableSettings.index.mapping = {};
      }
      updatableSettings.index.mapping.total_fields = {
        limit: config.settings.index.mapping.total_fields.limit,
      };
    }

    if (config.settings.index?.max_result_window !== undefined) {
      if (!updatableSettings.index) {
        updatableSettings.index = {};
      }
      updatableSettings.index.max_result_window =
        config.settings.index.max_result_window;
    }

    // Only update if there are settings to update
    if (Object.keys(updatableSettings).length > 0) {
      // Check current settings first
      const currentSettings = await esClient.indices.getSettings({
        index: config.index,
      });

      const indexSettings = currentSettings[config.index]?.settings?.index || {};
      const needsUpdate = checkSettingsNeedUpdate(
        updatableSettings,
        indexSettings
      );

      if (needsUpdate) {
        logger.debug(`Updating settings for index: ${config.index}`, {
          settings: updatableSettings,
        });

        await esClient.indices.putSettings({
          index: config.index,
          body: updatableSettings,
        });

        logger.debug(`Settings updated for index: ${config.index}`);
      }
    }
  } catch (error: any) {
    // Log but don't fail - settings update is not critical
    logger.warn(`Failed to update settings for index: ${config.index}`, {
      error: error?.message || error,
    });
  }
}

/**
 * Check if settings need to be updated
 * Compares desired settings with current settings
 */
function checkSettingsNeedUpdate(
  desiredSettings: any,
  currentSettings: any
): boolean {
  // Check number_of_replicas
  if (
    desiredSettings.number_of_replicas !== undefined &&
    currentSettings.number_of_replicas !==
      String(desiredSettings.number_of_replicas)
  ) {
    return true;
  }

  // Check refresh_interval
  if (
    desiredSettings.refresh_interval !== undefined &&
    currentSettings.refresh_interval !== desiredSettings.refresh_interval
  ) {
    return true;
  }

  // Check total_fields limit
  if (desiredSettings.index?.mapping?.total_fields?.limit !== undefined) {
    const currentLimit =
      currentSettings.mapping?.total_fields?.limit ||
      currentSettings['mapping.total_fields.limit'];
    const currentLimitNum =
      typeof currentLimit === 'string'
        ? parseInt(currentLimit, 10)
        : currentLimit;

    if (
      !currentLimitNum ||
      currentLimitNum < desiredSettings.index.mapping.total_fields.limit
    ) {
      return true;
    }
  }

  // Check max_result_window
  if (
    desiredSettings.index?.max_result_window !== undefined &&
    currentSettings.max_result_window !==
      String(desiredSettings.index.max_result_window)
  ) {
    return true;
  }

  return false;
}

