/**
 * Environment Setup Script
 * Creates .env files from templates
 * Run: node system/cli/setup-env.js
 */

import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const projectRoot = process.cwd();

const envFiles = {
  '.env': `# Base Environment Configuration
# This file is loaded first, then environment-specific files override values
# Shared configuration for all environments

# Node Environment
NODE_ENV=development

# Server Configuration
PORT=3000

# Application Name
APP_NAME=Kore App

# Logging
LOG_LEVEL=info
`,

  '.env.development': `# Development Environment Configuration
NODE_ENV=development

# Server Configuration
PORT=3000

# Elasticsearch Configuration (Local Development)
ELASTICSEARCH_HOST=http://localhost:9200
ELASTICSEARCH_USERNAME=
ELASTICSEARCH_PASSWORD=
ELASTICSEARCH_CA_CERT_PATH=
ELASTICSEARCH_REJECT_UNAUTHORIZED=false
ELASTICSEARCH_PING_TIMEOUT=5000
ELASTICSEARCH_REQUEST_TIMEOUT=30000
ELASTICSEARCH_MAX_RETRIES=3

# Shopify Configuration
SHOPIFY_API_VERSION=2024-01
SHOPIFY_API_MAX_RETRIES=10
SHOPIFY_API_BACKOFF_MS=500
SHOPIFY_API_MAX_WAIT_MS=10000

# Indexing Configuration
INDEXER_BATCH_SIZE=2000
INDEXER_MAX_CONCURRENT_BATCHES=3
INDEXER_CHECKPOINT_DEBOUNCE_MS=2000

# Static File Serving (Optional - for development)
# STATIC_PUBLIC_PATH=public
# STATIC_REACT_BUILD_PATH=client/build
# STATIC_PREFIX=/static
# REACT_PREFIX=/
# ENABLE_SPA_FALLBACK=true
# STATIC_MAX_AGE=86400000

# Debug/Development Flags
DEBUG=true
LOG_LEVEL=debug
`,

  '.env.staging': `# Staging Environment Configuration
NODE_ENV=staging

# Server Configuration
PORT=3000

# Elasticsearch Configuration (Staging)
ELASTICSEARCH_HOST=https://es-staging.example.com:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your-staging-password-here
ELASTICSEARCH_CA_CERT_PATH=/path/to/staging/ca-certificate.crt
ELASTICSEARCH_REJECT_UNAUTHORIZED=true
ELASTICSEARCH_PING_TIMEOUT=5000
ELASTICSEARCH_REQUEST_TIMEOUT=30000
ELASTICSEARCH_MAX_RETRIES=3

# Shopify Configuration
SHOPIFY_API_VERSION=2024-01
SHOPIFY_API_MAX_RETRIES=10
SHOPIFY_API_BACKOFF_MS=500
SHOPIFY_API_MAX_WAIT_MS=10000

# Indexing Configuration
INDEXER_BATCH_SIZE=2000
INDEXER_MAX_CONCURRENT_BATCHES=3
INDEXER_CHECKPOINT_DEBOUNCE_MS=2000

# Static File Serving (Optional - for staging)
# STATIC_PUBLIC_PATH=public
# STATIC_REACT_BUILD_PATH=client/build
# STATIC_PREFIX=/static
# REACT_PREFIX=/
# ENABLE_SPA_FALLBACK=true
# STATIC_MAX_AGE=86400000

# Logging
LOG_LEVEL=info
DEBUG=false
`,

  '.env.production': `# Production Environment Configuration
NODE_ENV=production

# Server Configuration
PORT=3000

# Elasticsearch Configuration (Production)
ELASTICSEARCH_HOST=https://es-prod.example.com:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your-production-password-here
ELASTICSEARCH_CA_CERT_PATH=/path/to/production/ca-certificate.crt
ELASTICSEARCH_REJECT_UNAUTHORIZED=true
ELASTICSEARCH_PING_TIMEOUT=5000
ELASTICSEARCH_REQUEST_TIMEOUT=30000
ELASTICSEARCH_MAX_RETRIES=3

# Shopify Configuration
SHOPIFY_API_VERSION=2024-01
SHOPIFY_API_MAX_RETRIES=10
SHOPIFY_API_BACKOFF_MS=500
SHOPIFY_API_MAX_WAIT_MS=10000

# Indexing Configuration
INDEXER_BATCH_SIZE=2000
INDEXER_MAX_CONCURRENT_BATCHES=3
INDEXER_CHECKPOINT_DEBOUNCE_MS=2000

# Static File Serving (Optional - for production)
# STATIC_PUBLIC_PATH=public
# STATIC_REACT_BUILD_PATH=client/build
# STATIC_PREFIX=/static
# REACT_PREFIX=/
# ENABLE_SPA_FALLBACK=true
# STATIC_MAX_AGE=86400000

# Logging
LOG_LEVEL=warn
DEBUG=false
`,
};

console.log('Setting up environment files...\n');

let created = 0;
let skipped = 0;

for (const [filename, content] of Object.entries(envFiles)) {
  const filePath = resolve(projectRoot, filename);
  
  if (existsSync(filePath)) {
    console.log(`⚠️  ${filename} already exists, skipping...`);
    skipped++;
  } else {
    writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Created ${filename}`);
    created++;
  }
}

console.log(`\n✨ Setup complete! Created ${created} file(s), skipped ${skipped} file(s).`);
console.log('\n📝 Next steps:');
console.log('   1. Edit the .env files with your actual configuration values');
console.log('   2. Make sure sensitive values are not committed to git');
console.log('   3. Set NODE_ENV to the appropriate environment (development, staging, production)');

