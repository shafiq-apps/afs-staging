/**
 * Elasticsearch Module Exports
 * Centralized exports for ES functionality
 */

export {
  getESClient,
  initializeES,
  isESHealthy,
  esConnection,
  type ESConnectionConfig,
} from './es.connection';

export { filterMappedFields, filterFields } from './es.document.filter';

