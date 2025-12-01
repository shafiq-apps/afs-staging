/**
 * HTTP Validation Schema
 * Framework-level validation schema definitions
 */

export type ValidationRule =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'email'
  | 'url'
  | 'date'
  | 'uuid';

export interface FieldValidation {
  type: ValidationRule;
  required?: boolean;
  default?: any;
  transform?: (value: any) => any;
  validate?: (value: any) => boolean | string;
  min?: number;
  max?: number;
  enum?: any[];
  pattern?: RegExp;
}

export interface ValidationSchema {
  query?: Record<string, FieldValidation>;
  body?: Record<string, FieldValidation>;
  params?: Record<string, FieldValidation>;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string[]>;
  data: {
    query?: Record<string, any>;
    body?: Record<string, any>;
    params?: Record<string, any>;
  };
}

