# Environment Setup Guide

This guide explains how to set up environment variables for different environments.

## Quick Start

1. Copy the template files to create your environment files:
   ```bash
   # For development
   cp .env.development.template .env.development
   
   # For staging
   cp .env.staging.template .env.staging
   
   # For production
   cp .env.production.template .env.production
   
   # Optional: Base .env file
   cp .env.template .env
   ```

2. Edit the copied files with your actual configuration values.

3. The application will automatically load the correct file based on `NODE_ENV`.

## Environment Files

### Base .env (Optional)
- Loaded first for all environments
- Contains shared configuration
- Can be overridden by environment-specific files

### .env.development
- Used when `NODE_ENV=development` (default)
- Local development configuration
- Usually points to local services (localhost)

### .env.staging
- Used when `NODE_ENV=staging`
- Staging environment configuration
- Points to staging services

### .env.production
- Used when `NODE_ENV=production`
- Production environment configuration
- Points to production services
- Should have secure credentials

## Configuration Variables

### Server Configuration
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment name (development, staging, production)

### Elasticsearch Configuration
- `ELASTICSEARCH_HOST` - ES host URL
- `ELASTICSEARCH_USERNAME` - ES username (optional)
- `ELASTICSEARCH_PASSWORD` - ES password (optional)
- `ELASTICSEARCH_CA_CERT_PATH` - Path to CA certificate (optional)
- `ELASTICSEARCH_REJECT_UNAUTHORIZED` - Reject unauthorized certs (default: false)
- `ELASTICSEARCH_PING_TIMEOUT` - Ping timeout in ms (default: 5000)
- `ELASTICSEARCH_REQUEST_TIMEOUT` - Request timeout in ms (default: 30000)
- `ELASTICSEARCH_MAX_RETRIES` - Max retries (default: 3)

### Shopify Configuration
- `SHOPIFY_API_VERSION` - Shopify API version (default: 2024-01)
- `SHOPIFY_API_MAX_RETRIES` - Max retries (default: 10)
- `SHOPIFY_API_BACKOFF_MS` - Backoff delay in ms (default: 500)
- `SHOPIFY_API_MAX_WAIT_MS` - Max wait time in ms (default: 10000)

### Indexing Configuration
- `INDEXER_BATCH_SIZE` - Batch size for indexing (default: 2000)
- `INDEXER_MAX_CONCURRENT_BATCHES` - Max concurrent batches (default: 3)
- `INDEXER_CHECKPOINT_DEBOUNCE_MS` - Checkpoint debounce in ms (default: 2000)

### Static File Serving (Optional)
- `STATIC_PUBLIC_PATH` - Path to public static files
- `STATIC_REACT_BUILD_PATH` - Path to React build directory
- `STATIC_PREFIX` - URL prefix for static files (default: /static)
- `REACT_PREFIX` - URL prefix for React app (default: /)
- `ENABLE_SPA_FALLBACK` - Enable SPA fallback (default: true)
- `STATIC_MAX_AGE` - Max age for static files in ms (default: 86400000)

### Logging
- `LOG_LEVEL` - Log level (debug, info, warn, error)
- `DEBUG` - Enable debug mode (true/false)

## Running in Different Environments

### Development
```bash
# Set NODE_ENV (optional, defaults to development)
export NODE_ENV=development

# Run the application
npm run dev
```

### Staging
```bash
# Set NODE_ENV
export NODE_ENV=staging

# Run the application
npm run build
npm start
```

### Production
```bash
# Set NODE_ENV
export NODE_ENV=production

# Build and run
npm run build
npm start
```

## Security Notes

⚠️ **IMPORTANT**: 
- Never commit `.env` files to version control
- All `.env*` files are automatically ignored by git
- Use secure passwords and credentials in production
- Keep production credentials secure and rotate them regularly
- Use environment-specific files for different deployments

## Troubleshooting

### Environment file not loading
- Check that the file exists in the project root
- Verify `NODE_ENV` is set correctly
- Check file permissions
- Look for errors in the application logs

### Wrong environment loaded
- Verify `NODE_ENV` environment variable
- Check that the correct `.env.{environment}` file exists
- Ensure the file is in the project root (not in dist/)

### Production path issues
- The loader automatically detects if running from `dist/` folder
- Ensure `.env.production` is in the project root (not in dist/)
- Check that paths are resolved correctly

## Example Values

### Development (Local)
```env
ELASTICSEARCH_HOST=http://localhost:9200
ELASTICSEARCH_REJECT_UNAUTHORIZED=false
DEBUG=true
```

### Staging/Production
```env
ELASTICSEARCH_HOST=https://es.example.com:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=secure-password
ELASTICSEARCH_CA_CERT_PATH=/etc/ssl/certs/ca.crt
ELASTICSEARCH_REJECT_UNAUTHORIZED=true
DEBUG=false
```

