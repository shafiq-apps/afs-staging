/**
 * Delay Utility
 * Framework-level utility for async delays
 */

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

