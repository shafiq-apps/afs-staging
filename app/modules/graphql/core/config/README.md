# Environment Configuration

Environment variable loading system that supports multiple environments and works in both development and production.

## Features

- **Multi-Environment Support**: Loads `.env.development`, `.env.staging`, `.env.production` based on `NODE_ENV`
- **Base .env File**: Optionally loads base `.env` file for shared configuration
- **Production Ready**: Works correctly with compiled JS in `dist/` folder
- **Type-Safe Helpers**: Utility functions for getting env vars with types
- **Early Loading**: Loads environment variables before application bootstrap

## File Structure

```
Kore/app/
├── .env                    # Base environment file (optional, loaded first)
├── .env.development        # Development environment
├── .env.staging            # Staging environment
├── .env.production         # Production environment
└── .env.example            # Example file (template)
```

## Usage

### 1. Automatic Loading

Environment variables are automatically loaded when the application starts (in `index.ts`):

```typescript
import { initEnv } from './core/config/env.loader';

// This is called automatically in index.ts
initEnv();
```

### 2. Manual Loading

You can also load environment variables manually:

```typescript
import { loadEnv } from '@core/config';

loadEnv({
  baseDir: '/path/to/project',
  env: 'production',
  override: false,
  loadDefault: true,
});
```

### 3. Getting Environment Variables

```typescript
import {
  getEnvVar,
  getEnvNumber,
  getEnvBoolean,
  getEnv,
  isProduction,
  isDevelopment,
  isStaging,
} from '@core/config';

// Get string with fallback
const host = getEnvVar('ELASTICSEARCH_HOST', 'http://localhost:9200');

// Get number
const port = getEnvNumber('PORT', 3000);

// Get boolean
const enabled = getEnvBoolean('FEATURE_ENABLED', false);

// Get current environment
const env = getEnv(); // 'development', 'staging', or 'production'

// Check environment
if (isProduction()) {
  // Production-specific code
}
```

## Configuration Options

### EnvLoaderOptions

```typescript
interface EnvLoaderOptions {
  baseDir?: string;        // Base directory for .env files (default: auto-detect)
  env?: string;            // Environment name (default: NODE_ENV or 'development')
  override?: boolean;      // Override existing vars (default: false)
  loadDefault?: boolean;   // Load .env file (default: true)
}
```

## Loading Order

1. **Base .env file** (if `loadDefault: true`)
   - Loaded first
   - Shared configuration for all environments

2. **Environment-specific file** (`.env.{NODE_ENV}`)
   - Loaded second
   - Overrides base .env values
   - Environment-specific configuration

## Environment Detection

The loader automatically detects the environment:

- **Development**: `NODE_ENV=development` or not set → loads `.env.development`
- **Staging**: `NODE_ENV=staging` → loads `.env.staging`
- **Production**: `NODE_ENV=production` → loads `.env.production`

## Production (dist/) Support

The loader automatically handles path resolution for production:

- **Development**: Uses `process.cwd()` (project root)
- **Production**: Detects if running from `dist/` and resolves to project root

This ensures `.env` files are found correctly in both scenarios.

## Example .env Files

### .env (Base - Optional)
```env
# Shared configuration
NODE_ENV=development
PORT=3000
```

### .env.development
```env
NODE_ENV=development
ELASTICSEARCH_HOST=http://localhost:9200
DEBUG=true
```

### .env.staging
```env
NODE_ENV=staging
ELASTICSEARCH_HOST=https://es-staging.example.com:9200
ELASTICSEARCH_CA_CERT_PATH=/path/to/ca.crt
```

### .env.production
```env
NODE_ENV=production
ELASTICSEARCH_HOST=https://es-prod.example.com:9200
ELASTICSEARCH_CA_CERT_PATH=/path/to/ca.crt
ELASTICSEARCH_REJECT_UNAUTHORIZED=true
```

## Best Practices

1. **Never commit .env files**: Add them to `.gitignore`
2. **Use .env.example**: Provide a template for other developers
3. **Environment-specific files**: Use `.env.{environment}` for different configs
4. **Base .env**: Use base `.env` for shared configuration
5. **Sensitive data**: Never put sensitive data in version control
6. **Type safety**: Use helper functions (`getEnvVar`, `getEnvNumber`, etc.) for type safety

## Error Handling

- Missing environment variables throw errors (unless default provided)
- Invalid number values throw errors
- Missing .env files are logged but don't cause errors
- All errors are logged with module-based logging

## Integration

The environment loader is automatically integrated:

1. **index.ts**: Calls `initEnv()` before bootstrap
2. **Bootstrap**: Can access all environment variables
3. **All modules**: Can use `process.env` or helper functions

No additional setup required!

