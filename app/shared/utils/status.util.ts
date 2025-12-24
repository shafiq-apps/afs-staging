/**
 * Status Utility Functions
 * Shared utilities for normalizing and checking status values
 */

/**
 * Normalize status string to uppercase
 * @param status - Status string to normalize
 * @returns Uppercase status string, or empty string if null/undefined
 */
export const normalizeStatus = (status?: string | null): string => {
  return (status || '').toUpperCase();
};

/**
 * Check if status is PUBLISHED
 * @param status - Status string to check
 * @returns True if status is PUBLISHED (case-insensitive)
 */
export const isPublishedStatus = (status?: string | null): boolean => {
  return normalizeStatus(status) === 'PUBLISHED';
};

