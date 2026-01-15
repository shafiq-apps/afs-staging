/**
 * Base path prefix for all routes
 * This should match the basename configured in vite.config.ts
 */
export const BASE_PATH = "/v2";
export const BASE_PATH_WITH_SLASH = "/v2/";

/**
 * Helper function to create paths with the base path prefix
 */
export function createPath(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${BASE_PATH}/${cleanPath}`;
}

