/**
 * Elasticsearch Connection Manager for Next.js Admin Panel
 * Direct connection to Elasticsearch for API routes
 */

import { Client, ClientOptions } from '@elastic/elasticsearch';
import fs from 'fs';
import path from 'path';

export interface ESConnectionConfig {
  host?: string;
  username?: string;
  password?: string;
  caCertPath?: string;
  rejectUnauthorized?: boolean;
  pingTimeout?: number;
  requestTimeout?: number;
  maxRetries?: number;
  nodes?: string | string[];
}

class ESConnectionManager {
  private client: Client | null = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<Client> | null = null;
  private config: ESConnectionConfig | null = null;

  /**
   * Initialize ES connection with configuration
   */
  async initialize(config?: ESConnectionConfig): Promise<Client> {
    // If already initialized, return existing client
    if (this.isInitialized && this.client) {
      return this.client;
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this._initialize(config);
    return this.initPromise;
  }

  private async _initialize(config?: ESConnectionConfig): Promise<Client> {
    try {
      console.log('[ES] Initializing Elasticsearch connection...');

      // Build configuration
      this.config = this.buildConfig(config);

      // Create client options
      const clientOptions: ClientOptions = {
        node: this.config.nodes || this.config.host || process.env.ELASTICSEARCH_HOST || 'http://localhost:9200',
        pingTimeout: this.config.pingTimeout || 5000,
        requestTimeout: this.config.requestTimeout || 30000,
        maxRetries: this.config.maxRetries || 3,
      };

      // Add authentication if provided
      if (this.config.username && this.config.password) {
        clientOptions.auth = {
          username: this.config.username,
          password: this.config.password,
        };
      } else if (process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD) {
        clientOptions.auth = {
          username: process.env.ELASTICSEARCH_USERNAME,
          password: process.env.ELASTICSEARCH_PASSWORD,
        };
      }

      // Build TLS configuration
      const tlsConfig = this.buildTLSConfig();

      if (Object.keys(tlsConfig).length > 0) {
        clientOptions.tls = tlsConfig;
      }

      // Create client
      this.client = new Client(clientOptions);

      // Test connection
      await this.testConnection();

      this.isInitialized = true;

      console.log('[ES] Elasticsearch connection initialized successfully', {
        node: clientOptions.node,
        hasAuth: !!clientOptions.auth,
        hasTLS: !!clientOptions.tls,
      });

      return this.client;
    } catch (error: any) {
      this.isInitialized = false;
      console.error('[ES] Failed to initialize Elasticsearch connection', error?.message || error);
      throw new Error(`ES connection failed: ${error?.message || error}`);
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Build configuration from provided config and environment variables
   */
  private buildConfig(config?: ESConnectionConfig): ESConnectionConfig {
    return {
      host: config?.host || process.env.ELASTICSEARCH_HOST,
      username: config?.username || process.env.ELASTICSEARCH_USERNAME,
      password: config?.password || process.env.ELASTICSEARCH_PASSWORD,
      caCertPath: config?.caCertPath || process.env.ELASTICSEARCH_CA_CERT_PATH,
      rejectUnauthorized: config?.rejectUnauthorized !== undefined
        ? config.rejectUnauthorized
        : process.env.ELASTICSEARCH_REJECT_UNAUTHORIZED !== 'false',
      pingTimeout: config?.pingTimeout || parseInt(process.env.ELASTICSEARCH_PING_TIMEOUT || '5000'),
      requestTimeout: config?.requestTimeout || parseInt(process.env.ELASTICSEARCH_REQUEST_TIMEOUT || '30000'),
      maxRetries: config?.maxRetries || parseInt(process.env.ELASTICSEARCH_MAX_RETRIES || '3'),
      nodes: config?.nodes || process.env.ELASTICSEARCH_NODES,
    };
  }

  /**
   * Build TLS configuration
   */
  private buildTLSConfig(): { ca?: Buffer; rejectUnauthorized: boolean } {
    const tlsConfig: { ca?: Buffer; rejectUnauthorized: boolean } = {
      rejectUnauthorized: this.config?.rejectUnauthorized !== false,
    };

    const caCertPath = this.config?.caCertPath;

    if (caCertPath && caCertPath.trim() !== '') {
      try {
        // Resolve path relative to project root or use absolute path
        const resolvedPath = path.isAbsolute(caCertPath)
          ? caCertPath
          : path.join(process.cwd(), caCertPath);

        if (fs.existsSync(resolvedPath)) {
          tlsConfig.ca = fs.readFileSync(resolvedPath);
          console.log(`[ES] CA certificate loaded from ${resolvedPath}`);
        } else {
          console.warn(`[ES] CA certificate file not found: ${resolvedPath}`);
          tlsConfig.rejectUnauthorized = false;
        }
      } catch (error: any) {
        console.warn(`[ES] Failed to load CA certificate: ${error?.message || error}`);
        tlsConfig.rejectUnauthorized = false;
      }
    } else {
      // No CA cert path provided - disable certificate verification for development
      console.warn('[ES] No CA certificate path provided. Certificate verification disabled.');
      tlsConfig.rejectUnauthorized = false;
    }

    return tlsConfig;
  }

  /**
   * Test ES connection
   */
  private async testConnection(): Promise<void> {
    if (!this.client) {
      throw new Error('ES client not initialized');
    }

    try {
      const response = await this.client.ping();
      if (!response) {
        throw new Error('ES ping failed - no response');
      }
      console.log('[ES] Connection test successful');
    } catch (error: any) {
      console.error('[ES] Connection test failed', error?.message || error);
      throw new Error(`ES connection test failed: ${error?.message || error}`);
    }
  }

  /**
   * Get ES client (must be initialized first)
   */
  getClient(): Client {
    if (!this.client) {
      throw new Error(
        'ES client not initialized. Call ESConnectionManager.initialize() first.'
      );
    }
    return this.client;
  }

  /**
   * Check if ES is connected
   */
  async isHealthy(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.ping();
      return true;
    } catch (error: any) {
      console.warn('[ES] Health check failed', error?.message || error);
      return false;
    }
  }

  /**
   * Close ES connection
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        console.log('[ES] Connection closed');
      } catch (error: any) {
        console.error('[ES] Error closing connection', error?.message || error);
      } finally {
        this.client = null;
        this.isInitialized = false;
      }
    }
  }
}

// Export singleton instance
export const esConnection = new ESConnectionManager();

// Export convenience functions
export async function initializeES(config?: ESConnectionConfig): Promise<Client> {
  return esConnection.initialize(config);
}

export function getESClient(): Client {
  return esConnection.getClient();
}

export async function isESHealthy(): Promise<boolean> {
  return esConnection.isHealthy();
}

// Initialize on module load (for Next.js API routes)
if (typeof window === 'undefined') {
  // Server-side only
  initializeES().catch((error) => {
    console.error('[ES] Failed to auto-initialize:', error);
  });
}

