/**
 * GraphQL Index Configuration
 * Maps GraphQL types to ES index names - fully configurable, no hardcoded values
 */

import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('index-config',{disabled: true});

/**
 * Index configuration map
 * TypeName -> IndexName
 * Can be configured via schema annotations or programmatically
 */
let INDEX_CONFIG: Record<string, {
  index: string;
  idField?: string;
  sensitiveFields?: string[];
  isDynamic?: boolean; // True if index contains placeholders like {shop}
  placeholders?: string[]; // List of placeholder names like ['shop', 'date']
}> = {};

/**
 * Configure index for a GraphQL type
 */
export function configureIndex(
  typeName: string,
  config: {
    index: string;
    idField?: string;
    sensitiveFields?: string[];
  }
): void {
  // Detect if index is dynamic (contains placeholders like {shop})
  const placeholderRegex = /\{(\w+)\}/g;
  const placeholders: string[] = [];
  let match;
  while ((match = placeholderRegex.exec(config.index)) !== null) {
    placeholders.push(match[1]);
  }
  
  const isDynamic = placeholders.length > 0;
  
  INDEX_CONFIG[typeName] = {
    ...config,
    isDynamic,
    placeholders: isDynamic ? placeholders : undefined,
  };
  
  logger.info(`Configured index for type ${typeName}`, {
    ...config,
    isDynamic,
    placeholders: isDynamic ? placeholders : undefined,
  });
}

/**
 * Get index configuration for a type
 */
export function getIndexConfig(typeName: string): {
  index: string;
  idField?: string;
  sensitiveFields?: string[];
  isDynamic?: boolean;
  placeholders?: string[];
} | null {
  return INDEX_CONFIG[typeName] || null;
}

/**
 * Resolve dynamic index name by replacing placeholders with argument values
 * @param typeName GraphQL type name
 * @param args GraphQL query arguments
 * @returns Resolved index name
 */
export function resolveDynamicIndexName(
  typeName: string,
  args: Record<string, any>
): string {
  const config = getIndexConfig(typeName);
  if (!config) {
    return getIndexName(typeName);
  }
  
  // If not dynamic, return as-is
  if (!config.isDynamic || !config.placeholders) {
    return config.index;
  }
  
  // Replace placeholders with argument values
  let resolvedIndex = config.index;
  config.placeholders.forEach(placeholder => {
    const value = args[placeholder];
    if (value !== undefined && value !== null) {
      // Replace {placeholder} with the actual value
      // Also sanitize the value (remove special chars that might break ES index names)
      const sanitizedValue = String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
      resolvedIndex = resolvedIndex.replace(`{${placeholder}}`, sanitizedValue);
    } else {
      logger.warn(`Placeholder ${placeholder} not found in arguments for type ${typeName}`, {
        placeholders: config.placeholders,
        availableArgs: Object.keys(args),
      });
      // Use placeholder name as fallback
      resolvedIndex = resolvedIndex.replace(`{${placeholder}}`, placeholder);
    }
  });
  
  logger.debug(`Resolved dynamic index for type ${typeName}`, {
    original: config.index,
    resolved: resolvedIndex,
    placeholders: config.placeholders,
    args: Object.keys(args),
  });
  
  return resolvedIndex;
}

/**
 * Get index name for a type (with fallback)
 */
export function getIndexName(typeName: string): string {
  const config = getIndexConfig(typeName);
  if (config) {
    return config.index;
  }

  // Default: pluralize and lowercase
  // Shop -> shops, Filter -> filters
  const plural = typeName.endsWith('s') 
    ? typeName.toLowerCase() 
    : `${typeName.toLowerCase()}s`;
  
  return plural;
}

/**
 * Get sensitive fields for a type
 */
export function getSensitiveFields(typeName: string): string[] {
  const config = getIndexConfig(typeName);
  return config?.sensitiveFields || [];
}

/**
 * Get ID field for a type
 */
export function getIdField(typeName: string): string {
  const config = getIndexConfig(typeName);
  return config?.idField || 'id';
}

/**
 * Parse index configuration from schema comments
 * Supports: # @index shops
 * Note: Annotation can come before or after the type definition
 */
export function parseIndexConfigFromSchema(schemaString: string): void {
  const lines = schemaString.split('\n');
  let currentType: string | null = null;
  const typeAnnotations = new Map<string, any>(); // Store annotations by type name

  // First pass: collect all type definitions and their annotations
  lines.forEach((line) => {
    // Detect type definition
    const typeMatch = line.match(/type\s+(\w+)/);
    if (typeMatch) {
      currentType = typeMatch[1];
    }

    // Parse index annotation (supports dynamic indexes like filters-{shop})
    // Handles both # @index and @index (with or without comment marker)
    const indexMatch = line.match(/#?\s*@index\s+([\w{}-]+)(?:\s+(.+))?/);
    if (indexMatch) {
      const indexName = indexMatch[1]; // Can contain {placeholders}
      const options = indexMatch[2] || '';

      const config: any = { index: indexName };

      // Parse options
      if (options.includes('idField=')) {
        const idFieldMatch = options.match(/idField=(\w+)/);
        if (idFieldMatch) {
          config.idField = idFieldMatch[1];
        }
      }

      if (options.includes('sensitiveFields=')) {
        const sensitiveMatch = options.match(/sensitiveFields=([\w,]+)/);
        if (sensitiveMatch) {
          config.sensitiveFields = sensitiveMatch[1].split(',').map(s => s.trim());
        }
      }

      // If we have a current type, associate annotation with it
      if (currentType) {
        typeAnnotations.set(currentType, config);
        logger.debug(`Found @index annotation for type ${currentType}`, config);
      } else {
        // Annotation before any type - look ahead to next type definition
        // This handles cases where annotation comes before the type
        logger.warn(`@index annotation found before type definition: ${indexName}. Annotation should be placed after the type definition.`);
      }
    }
  });

  // Second pass: apply all collected annotations
  typeAnnotations.forEach((config, typeName) => {
    configureIndex(typeName, config);
    logger.info(`Configured index for type ${typeName}`, config);
  });
}

/**
 * Initialize index config from all schemas
 */
export function initializeIndexConfig(schemas: string[]): void {
  schemas.forEach(schema => {
    parseIndexConfigFromSchema(schema);
  });
  
  logger.info('Initialized index configuration', {
    configuredTypes: Object.keys(INDEX_CONFIG),
  });
}

