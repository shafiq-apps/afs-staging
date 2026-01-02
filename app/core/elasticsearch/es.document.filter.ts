/**
 * Document Field Filter
 * Filters out unmapped fields from documents before indexing
 * Prevents "field limit exceeded" errors in Elasticsearch
 */

import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('DocumentFilter');

/**
 * Get all allowed field paths from a mapping
 */
function getAllowedFields(mapping: any, prefix = ''): Set<string> {
  const allowed = new Set<string>();

  if (!mapping || !mapping.properties) {
    return allowed;
  }

  for (const [fieldName, fieldMapping] of Object.entries(mapping.properties)) {
    const fullPath = prefix ? `${prefix}.${fieldName}` : fieldName;
    allowed.add(fullPath);

    // Recursively get nested fields
    if (fieldMapping && typeof fieldMapping === 'object' && fieldMapping !== null) {
      const mapping = fieldMapping as any;
      if (mapping.type === 'nested' && mapping.properties) {
        // For nested fields, we allow the array itself and its properties
        const nestedFields = getAllowedFields(mapping, fullPath);
        nestedFields.forEach((f) => allowed.add(f));
      } else if (mapping.properties) {
        // For object fields
        const objectFields = getAllowedFields(mapping, fullPath);
        objectFields.forEach((f) => allowed.add(f));
      }
    }
  }

  return allowed;
}

/**
 * Filter document to only include mapped fields
 * This prevents "field limit exceeded" errors
 * 
 * @param doc - Document to filter
 * @param mapping - Elasticsearch mapping
 * @returns Filtered document with only mapped fields
 */
export function filterMappedFields(doc: any, mapping: any): any {
  if (!mapping || !mapping.properties) {
    logger.warn('No mapping provided, returning document as-is');
    return doc;
  }

  const allowedFields = getAllowedFields(mapping);
  const filtered: any = {};

  // Helper to check if a field path is allowed
  const isFieldAllowed = (fieldPath: string): boolean => {
    // Check exact match
    if (allowedFields.has(fieldPath)) {
      return true;
    }

    // Check if it's a nested field (e.g., "variants.id" when "variants" is nested)
    const parts = fieldPath.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join('.');
      if (allowedFields.has(parentPath)) {
        // Check if parent is nested or object
        const parentMapping = getFieldMapping(mapping, parentPath);
        if (parentMapping?.type === 'nested' || parentMapping?.properties) {
          return true;
        }
      }
    }

    return false;
  };

  // Helper to get field mapping
  const getFieldMapping = (mapping: any, fieldPath: string): any => {
    const parts = fieldPath.split('.');
    let current = mapping.properties;
    for (const part of parts) {
      if (!current || !current[part]) {
        return null;
      }
      current = current[part];
    }
    return current;
  };

  // Recursively filter object
  const filterObject = (obj: any, path = ''): any => {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map((item, index) => {
        if (typeof item === 'object' && item !== null) {
          return filterObject(item, path);
        }
        return item;
      });
    }

    // Handle objects
    if (typeof obj === 'object') {
      const filtered: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const fieldPath = path ? `${path}.${key}` : key;

        // Skip unmapped fields
        if (!isFieldAllowed(fieldPath)) {
          continue;
        }

        // Recursively filter nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          filtered[key] = filterObject(value, fieldPath);
        } else if (Array.isArray(value)) {
          filtered[key] = filterObject(value, fieldPath);
        } else {
          filtered[key] = value;
        }
      }
      return filtered;
    }

    return obj;
  };

  return filterObject(doc);
}

/**
 * Simple field filter - removes fields not in the allowed list
 * Use this when you have a simple list of allowed top-level fields
 */
export function filterFields(doc: any, allowedFields: string[]): any {
  const filtered: any = {};
  const allowedSet = new Set(allowedFields);

  for (const [key, value] of Object.entries(doc)) {
    if (allowedSet.has(key)) {
      filtered[key] = value;
    } else {
      logger.info(`Filtering out field: ${key}`);
    }
  }

  return filtered;
}

