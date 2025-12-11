/**
 * Sanitization Constants
 * Defines blocked and allowed characters for query parameter sanitization
 * 
 * These constants can be modified to adjust sanitization behavior without
 * changing the core sanitization logic in helper functions.
 */

/**
 * Characters that are always blocked for security reasons
 * These pose injection risks (HTML/script injection, control characters, etc.)
 */
export const BLOCKED_CHARS_ALWAYS = '<>`\x00-\x1F\x7F';

/**
 * Characters blocked in query parameter values
 * These are removed from query parameter values during sanitization
 * 
 * Default: Only HTML/script injection chars and control characters
 * Modify this to add/remove characters as needed
 */
export const BLOCKED_CHARS_QUERY_VALUE = '<>`\x00-\x1F\x7F';

/**
 * Characters blocked in query parameter keys
 * These are removed from query parameter keys during sanitization
 * 
 * Default: Only HTML/script injection chars and control characters
 * Modify this to add/remove characters as needed
 */
export const BLOCKED_CHARS_QUERY_KEY = '<>`\x00-\x1F\x7F';

/**
 * Characters blocked in ES terms array values
 * These are ES query syntax operators that could potentially be used for injection
 * 
 * Note: ES `terms` queries use exact matching, so most characters are safe.
 * These are kept for extra safety when constructing queries.
 * 
 * Default: = { } [ ] ^ ~ * ? : \
 * Modify this to add/remove characters as needed
 */
export const BLOCKED_CHARS_ES_TERMS = '={}[\\]^~*?:\\\\';

/**
 * Characters that are explicitly allowed in query values
 * These are safe characters that should be preserved
 * 
 * Currently allowed: alphanumeric, spaces, quotes (" '), parentheses (),
 * forward slash (/), ampersand (&), percent (%), hyphen (-), underscore (_),
 * plus (+), hash (#), exclamation (!), dot (.), comma (,), and more
 * 
 * This is for documentation purposes - the actual allowed set is
 * "everything except BLOCKED_CHARS_QUERY_VALUE"
 */
export const ALLOWED_CHARS_QUERY_VALUE = [
  'alphanumeric (a-z, A-Z, 0-9)',
  'spaces',
  '" (double quote)',
  "' (single quote)",
  '( ) (parentheses)',
  '/ (forward slash)',
  '& (ampersand)',
  '% (percent)',
  '- (hyphen)',
  '_ (underscore)',
  '+ (plus)',
  '# (hash)',
  '! (exclamation)',
  '. (dot)',
  ', (comma)',
  'and more...',
] as const;

/**
 * Maximum length for query parameter values
 */
export const MAX_QUERY_VALUE_LENGTH = 500;

/**
 * Maximum length for query parameter keys
 */
export const MAX_QUERY_KEY_LENGTH = 200;

/**
 * Maximum items in terms array
 */
export const MAX_TERMS_ARRAY_ITEMS = 100;

/**
 * Maximum length for individual term in terms array
 */
export const MAX_TERM_LENGTH = 100;

/**
 * Maximum length for option key in filter input
 */
export const MAX_OPTION_KEY_LENGTH = 200;

/**
 * Maximum length for option value in filter input
 */
export const MAX_OPTION_VALUE_LENGTH = 200;

