/**
 * Search Configuration Types
 * Types for search field configuration data structures
 * Uses camelCase for all field names (following coding standards)
 */

export interface SearchField {
  field: string;
  weight: number;
}

export interface SearchConfig {
  id: string;
  shop: string;
  fields: SearchField[];
  createdAt: string;
  updatedAt?: string | null;
}

export interface SearchConfigInput {
  fields: SearchField[];
}

