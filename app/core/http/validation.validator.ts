/**
 * HTTP Request Validator
 * Framework-level validator for HTTP requests
 */

import { HttpRequest } from '@core/http/http.types';
import { ValidationSchema, ValidationResult, FieldValidation } from '@core/http/validation.schema';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('validation');
import { sanitizeString, sanitizeStringArray, sanitizeNumber, sanitizeObject } from '@shared/utils/sanitizer.util';

function validateField(
  fieldName: string,
  value: any,
  rule: FieldValidation,
  source: 'query' | 'body' | 'params'
): { valid: boolean; error?: string; transformed?: any } {
  if (value === undefined || value === null) {
    if (rule.required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    if (rule.default !== undefined) {
      return { valid: true, transformed: rule.default };
    }
    return { valid: true, transformed: undefined };
  }

  let transformed = value;

  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') {
        transformed = String(value);
      }
      transformed = sanitizeString(transformed, rule.max);
      if (rule.min !== undefined && transformed.length < rule.min) {
        return { valid: false, error: `${fieldName} must be at least ${rule.min} characters` };
      }
      if (rule.max !== undefined && transformed.length > rule.max) {
        return { valid: false, error: `${fieldName} must be at most ${rule.max} characters` };
      }
      if (rule.pattern && !rule.pattern.test(transformed)) {
        return { valid: false, error: `${fieldName} format is invalid` };
      }
      break;

    case 'number':
      const sanitizedNum = sanitizeNumber(value, rule.min, rule.max);
      if (sanitizedNum === undefined) {
        return { valid: false, error: `${fieldName} must be a number` };
      }
      transformed = sanitizedNum;
      break;

    case 'boolean':
      if (typeof value === 'string') {
        transformed = value === 'true' || value === '1' || value === 'yes';
      } else {
        transformed = Boolean(value);
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        if (typeof value === 'string') {
          transformed = value.split(',').map((v) => v.trim()).filter(Boolean);
        } else {
          transformed = [value];
        }
      }
      transformed = sanitizeStringArray(transformed, rule.max, 1000);
      if (rule.min !== undefined && transformed.length < rule.min) {
        return { valid: false, error: `${fieldName} must have at least ${rule.min} items` };
      }
      if (rule.max !== undefined && transformed.length > rule.max) {
        return { valid: false, error: `${fieldName} must have at most ${rule.max} items` };
      }
      break;

    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) {
        try {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          transformed = sanitizeObject(parsed, 5);
        } catch {
          return { valid: false, error: `${fieldName} must be a valid object` };
        }
      } else {
        transformed = sanitizeObject(value, 5);
      }
      break;

    case 'email':
      if (typeof value !== 'string') {
        transformed = String(value);
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(transformed)) {
        return { valid: false, error: `${fieldName} must be a valid email` };
      }
      break;

    case 'url':
      if (typeof value !== 'string') {
        transformed = String(value);
      }
      try {
        new URL(transformed);
      } catch {
        return { valid: false, error: `${fieldName} must be a valid URL` };
      }
      break;

    case 'date':
      if (typeof value !== 'string') {
        transformed = String(value);
      }
      const date = new Date(transformed);
      if (isNaN(date.getTime())) {
        return { valid: false, error: `${fieldName} must be a valid date` };
      }
      transformed = date.toISOString();
      break;

    case 'uuid':
      if (typeof value !== 'string') {
        transformed = String(value);
      }
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(transformed)) {
        return { valid: false, error: `${fieldName} must be a valid UUID` };
      }
      break;
  }

  if (rule.enum && !rule.enum.includes(transformed)) {
    return { valid: false, error: `${fieldName} must be one of: ${rule.enum.join(', ')}` };
  }

  if (rule.transform) {
    try {
      transformed = rule.transform(transformed);
    } catch (error: any) {
      return { valid: false, error: `${fieldName} transformation failed: ${error?.message || error}` };
    }
  }

  if (rule.validate) {
    const customResult = rule.validate(transformed);
    if (customResult !== true) {
      return { valid: false, error: typeof customResult === 'string' ? customResult : `${fieldName} validation failed` };
    }
  }

  return { valid: true, transformed };
}

export function validateRequest(req: HttpRequest, schema: ValidationSchema): ValidationResult {
  const errors: Record<string, string[]> = {};
  const data: ValidationResult['data'] = {};

  if (schema.query) {
    data.query = {};
    for (const [fieldName, rule] of Object.entries(schema.query)) {
      const value = req.query[fieldName];
      const result = validateField(fieldName, value, rule, 'query');

      if (!result.valid) {
        if (!errors[`query.${fieldName}`]) {
          errors[`query.${fieldName}`] = [];
        }
        errors[`query.${fieldName}`].push(result.error || 'Validation failed');
      } else {
        if (result.transformed !== undefined) {
          data.query[fieldName] = result.transformed;
        }
      }
    }
  }

  if (schema.body) {
    data.body = {};
    for (const [fieldName, rule] of Object.entries(schema.body)) {
      const value = (req.body as any)?.[fieldName];
      const result = validateField(fieldName, value, rule, 'body');

      if (!result.valid) {
        if (!errors[`body.${fieldName}`]) {
          errors[`body.${fieldName}`] = [];
        }
        errors[`body.${fieldName}`].push(result.error || 'Validation failed');
      } else {
        if (result.transformed !== undefined) {
          data.body[fieldName] = result.transformed;
        }
      }
    }
  }

  if (schema.params) {
    data.params = {};
    for (const [fieldName, rule] of Object.entries(schema.params)) {
      const value = req.params[fieldName];
      const result = validateField(fieldName, value, rule, 'params');

      if (!result.valid) {
        if (!errors[`params.${fieldName}`]) {
          errors[`params.${fieldName}`] = [];
        }
        errors[`params.${fieldName}`].push(result.error || 'Validation failed');
      } else {
        if (result.transformed !== undefined) {
          data.params[fieldName] = result.transformed;
        }
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data,
  };
}

