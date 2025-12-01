# Elasticsearch Connection Manager

Centralized Elasticsearch connection management for the application.

## Features

- **Singleton Pattern**: Single ES connection instance shared across all modules
- **Automatic Initialization**: Connection is initialized once during bootstrap
- **Connection Testing**: Automatic health checks and connection validation
- **Error Handling**: Graceful error handling with retry logic
- **TLS Support**: Full TLS/SSL certificate support
- **Environment Variables**: Configuration via environment variables
- **Health Monitoring**: Connection status and health check utilities

## Usage

### 1. Initialize in Bootstrap

The ES connection is automatically initialized in `core/bootstrap/main.ts`:

```typescript
import { initializeES, getESClient } from '@core/elasticsearch/es.client';

// In bootstrap function
await initializeES({
  host: process.env.ELASTICSEARCH_HOST,
  username: process.env.ELASTICSEARCH_USERNAME,
  password: process.env.ELASTICSEARCH_PASSWORD,
  caCertPath: process.env.ELASTICSEARCH_CA_CERT_PATH,
});
```

### 2. Use in Modules

Simply import `getESClient()` anywhere you need ES access:

```typescript
import { getESClient } from '@core/elasticsearch/es.client';

// In a repository or service
const esClient = getESClient();
const response = await esClient.search({ index: 'products', body: { ... } });
```

### 3. Check Connection Health

```typescript
import { isESHealthy } from '@core/elasticsearch/es.client';

const healthy = await isESHealthy();
if (!healthy) {
  // Handle unhealthy connection
}
```

## Configuration

### Environment Variables

- `ELASTICSEARCH_HOST` - ES host URL (default: `http://localhost:9200`)
- `ELASTICSEARCH_USERNAME` - ES username (optional)
- `ELASTICSEARCH_PASSWORD` - ES password (optional)
- `ELASTICSEARCH_CA_CERT_PATH` - Path to CA certificate file (optional)
- `ELASTICSEARCH_REJECT_UNAUTHORIZED` - Reject unauthorized certificates (default: `true`)
- `ELASTICSEARCH_PING_TIMEOUT` - Ping timeout in ms (default: `5000`)
- `ELASTICSEARCH_REQUEST_TIMEOUT` - Request timeout in ms (default: `30000`)
- `ELASTICSEARCH_MAX_RETRIES` - Max retries for requests (default: `3`)

### Programmatic Configuration

```typescript
import { initializeES } from '@core/elasticsearch/es.client';

await initializeES({
  host: 'https://es.example.com:9200',
  username: 'elastic',
  password: 'password',
  caCertPath: '/path/to/ca.crt',
  rejectUnauthorized: true,
  pingTimeout: 5000,
  requestTimeout: 30000,
  maxRetries: 3,
});
```

## Connection Status

```typescript
import { esConnection } from '@core/elasticsearch/es.client';

const status = esConnection.getStatus();
// Returns: { initialized: boolean, connected: boolean, hasClient: boolean }
```

## Error Handling

The connection manager handles:
- Connection failures during initialization
- Health check failures
- TLS certificate errors
- Authentication errors

All errors are logged with module-based logging for easy debugging.

## Best Practices

1. **Always use `getESClient()`** - Never create a new Client instance directly
2. **Initialize once** - Call `initializeES()` only in bootstrap
3. **Check health** - Use `isESHealthy()` for health checks in monitoring endpoints
4. **Handle errors** - Wrap ES operations in try-catch blocks
5. **Use connection status** - Check `esConnection.getStatus()` before critical operations

## Examples

### Repository Pattern

```typescript
import { getESClient } from '@core/elasticsearch/es.client';

export class MyRepository {
  private esClient = getESClient();
  private index = 'my_index';

  async getDocument(id: string) {
    return await this.esClient.get({
      index: this.index,
      id,
    });
  }
}
```

### Service Pattern

```typescript
import { getESClient } from '@core/elasticsearch/es.client';

export class MyService {
  constructor(private repository: MyRepository) {}

  async processData() {
    const esClient = getESClient();
    // Use esClient...
  }
}
```

### Health Check Endpoint

```typescript
import { isESHealthy, esConnection } from '@core/elasticsearch/es.client';

export const GET = handler(async (req) => {
  const healthy = await isESHealthy();
  const status = esConnection.getStatus();
  
  return {
    es: {
      healthy,
      ...status,
    },
  };
});
```

