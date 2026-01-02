/**
 * GraphQL Auto Resolver Generator
 * Fully dynamic - works with any ES index, no hardcoded values
 * Automatically generates resolvers from schema definitions
 */

import { GraphQLSchema, GraphQLObjectType } from 'graphql';
import { GraphQLContext } from './graphql.type';
import { createModuleLogger } from '@shared/utils/logger.util';
import { Client } from '@elastic/elasticsearch';
import { createESService, esServiceRegistry } from './graphql.es-factory';
import { GraphQLESService } from './graphql.es-service';
import { getIndexName, getIndexConfig, initializeIndexConfig, getIdField, resolveDynamicIndexName } from './graphql.index-config';

const logger = createModuleLogger('auto-resolver');

/**
 * Get or create ES service for a type
 * Supports both static and dynamic indexes
 */
export function getESServiceForType(
  typeName: string,
  esClient: Client,
  context: GraphQLContext,
  graphqlArgs?: Record<string, any>
): GraphQLESService | null {
  // Resolve index name (handles dynamic indexes)
  const config = getIndexConfig(typeName);
  let indexName: string;
  let serviceKey: string;
  
  if (config?.isDynamic && graphqlArgs) {
    // Dynamic index - resolve placeholders from arguments
    indexName = resolveDynamicIndexName(typeName, graphqlArgs);
    serviceKey = esServiceRegistry.generateKey(typeName, indexName);
  } else {
    // Static index
    indexName = getIndexName(typeName);
    serviceKey = esServiceRegistry.generateKey(typeName);
  }
  
  // Check registry first
  if (esServiceRegistry.has(serviceKey)) {
    return esServiceRegistry.get(serviceKey);
  }

  // Create new service
  try {
    const service = createESService(esClient, typeName, {
      index: indexName,
      idField: config?.idField,
      sensitiveFields: config?.sensitiveFields,
    });
    
    esServiceRegistry.register(serviceKey, service);
    logger.info(`Created ES service for type ${typeName}`, {
      index: indexName,
      serviceKey,
      isDynamic: config?.isDynamic || false,
      idField: config?.idField,
      sensitiveFieldsCount: config?.sensitiveFields?.length || 0,
    });
    return service;
  } catch (error: any) {
    logger.error(`Failed to create ES service for type ${typeName}`, {
      index: indexName,
      serviceKey,
      error: error?.message || error,
    });
    return null;
  }
}

/**
 * Get return type name from GraphQL type
 */
function getReturnTypeName(type: any): string | null {
  if (!type) return null;

  // Handle non-null and list types
  let unwrapped = type;
  while (unwrapped.ofType) {
    unwrapped = unwrapped.ofType;
  }

  return unwrapped.name || null;
}

/**
 * Auto-generate resolver for a field
 * Fully dynamic - uses ES directly, no hardcoded service names
 */
function generateAutoResolver(
  fieldName: string,
  fieldType: any,
  args: any[],
  isMutation: boolean,
  returnTypeName: string | null,
  esClient: Client
): any {
  return async (parent: any, graphqlArgs: any, context: GraphQLContext) => {
    try {
      // Log immediately to confirm resolver is called
      logger.info(`[AUTO-RESOLVER] ${fieldName} called`, {
        fieldName,
        returnTypeName,
        isMutation,
        args: Object.keys(graphqlArgs),
        argValues: graphqlArgs,
        hasESClient: !!esClient,
      });
      
      logger.info("Auto-resolver called", {
        fieldName,
        returnTypeName,
        isMutation,
        args: Object.keys(graphqlArgs),
        argValues: graphqlArgs,
        hasESClient: !!esClient,
      });
      

      // For delete operations, infer the entity type from the field name
      // e.g., deleteShop -> Shop (not Boolean)
      let entityTypeName = returnTypeName;
      if (isMutation && (fieldName.startsWith('delete') || fieldName.startsWith('remove'))) {
        // Extract entity type from field name: deleteShop -> Shop, deleteFilter -> Filter
        const prefix = fieldName.startsWith('delete') ? 'delete' : 'remove';
        const entityName = fieldName.substring(prefix.length);
        if (entityName) {
          entityTypeName = entityName;
          logger.info(`Inferred entity type for delete operation: ${entityTypeName} from ${fieldName}`);
        }
      }

      // Get ES service dynamically based on return type (or inferred entity type for deletes)
      if (!entityTypeName) {
        logger.warn(`Could not determine type for field: ${fieldName}`);
        throw {
          code: 'TYPE_NOT_FOUND',
          message: `Could not determine type for field: ${fieldName}`,
        };
      }

      // Get or create ES service for this type (pass args for dynamic index resolution)
      logger.info(`Getting ES service for type: ${entityTypeName}`, {
        entityTypeName,
        graphqlArgs: Object.keys(graphqlArgs),
      });
      
      const esService = getESServiceForType(entityTypeName, esClient, context, graphqlArgs);
      if (!esService) {
        logger.error(`Could not create ES service for type: ${entityTypeName}`, {
          entityTypeName,
          graphqlArgs,
        });
        throw {
          code: 'SERVICE_UNAVAILABLE',
          message: `Could not create service for type: ${entityTypeName}`,
        };
      }
      
      logger.info(`ES service obtained for type: ${entityTypeName}`, {
        entityTypeName,
        serviceIndex: (esService as any)['repository']?.['index'],
      });

      // Determine operation based on field name and arguments
      // Fully dynamic - no hardcoded method names
      
      logger.info(`Auto-resolving field`, {
        field: fieldName,
        returnType: returnTypeName,
        entityType: entityTypeName,
        isMutation,
        args: args.map(a => a.name),
      });

      let result: any;

      // Mutations
      if (isMutation) {
        if (fieldName.startsWith('create')) {
          // createShop(input) -> esService.create(input)
          const input = graphqlArgs.input || graphqlArgs;
          result = await esService.create(input, graphqlArgs.id);
        } else if (fieldName.startsWith('update')) {
          // updateShop(id, input) -> esService.update(id, input)
          const id = graphqlArgs.id || graphqlArgs[args[0]?.name || 'id'];
          const input = graphqlArgs.input || Object.fromEntries(
            Object.entries(graphqlArgs).filter(([k]) => k !== 'id')
          );
          result = await esService.update(id, input);
        } else if (fieldName.startsWith('delete') || fieldName.startsWith('remove')) {
          // deleteShop(domain) -> esService.delete(domain)
          // Support both id-based and field-based deletion
          let id: string | undefined;
          
          // Try id first (for mutations like deleteFilter(id))
          if (graphqlArgs.id) {
            id = graphqlArgs.id;
          } else if (args.length > 0 && args[0]?.name) {
            // Use the first argument's name (e.g., 'domain' for deleteShop(domain))
            id = graphqlArgs[args[0].name];
          } else {
            // Fallback: try common ID field names
            id = graphqlArgs._id || graphqlArgs.domain || graphqlArgs.shop;
          }
          
          if (!id) {
            logger.error(`Could not determine ID for delete operation: ${fieldName}`, {
              args: args.map(a => a.name),
              graphqlArgs: Object.keys(graphqlArgs),
            });
            return false;
          }
          
          logger.info(`Deleting ${entityTypeName}`, { id, field: fieldName });
          result = await esService.delete(id);
          return result; // Boolean
        }
      } 
      // Queries
      else {
        // Check for "exists" pattern
        if (fieldName.endsWith('Exists') || fieldName.includes('Exists')) {
          // shopExists(domain) -> esService.existsByField('shop', domain) or getById(domain)
          const firstArg = args[0];
          if (firstArg) {
            const argName = firstArg.name; // e.g., 'domain'
            const value = graphqlArgs[firstArg.name];
            
            // Check if this should be an ID-based lookup
            const indexConfig = getIndexConfig(returnTypeName || '');
            const idField = indexConfig?.idField;
            
            // For Shop type: if idField is 'shop' and argument is 'domain', use as ID (domain = shop value)
            // Or if argument name matches idField, use as ID
            const isIdLookup = 
              argName === 'id' || 
              argName === '_id' ||
              (idField && argName === idField) ||
              (returnTypeName === 'Shop' && idField === 'shop' && argName === 'domain');
            
            if (isIdLookup) {
              // Use ID-based lookup
              result = await esService.exists(value);
            } else {
              // Use field-based lookup
              result = await esService.existsByField(argName, value);
            }
          } else {
            // shopExists(id) -> esService.exists(id)
            const id = graphqlArgs.id || Object.values(graphqlArgs)[0];
            result = await esService.exists(id as string);
          }
        }
        // Check for list/plural pattern
        else if (fieldName.endsWith('s') && fieldName.length > 1) {
          // shops(shop, limit) -> esService.list({ shop }, { limit })
          const filters: Record<string, any> = {};
          const options: any = {};

          args.forEach(arg => {
            if (['limit', 'offset', 'page', 'size'].includes(arg.name)) {
              options[arg.name === 'page' ? 'offset' : arg.name] = graphqlArgs[arg.name];
            } else if (arg.name !== 'sort' && arg.name !== 'sortBy') {
              filters[arg.name] = graphqlArgs[arg.name];
            }
          });

          result = await esService.list(filters, options);
        }
        // Single item query
        else {
          // shop(domain) -> esService.getById(domain) if domain is the document ID
          // shop(id) -> esService.getById(id)
          // shop(domain) -> esService.getByField('domain', domain) if domain is a field
          const firstArg = args[0];
          if (firstArg) {
            const argValue = graphqlArgs[firstArg.name];
            
            // Check if this should be an ID-based lookup
            const indexConfig = getIndexConfig(returnTypeName || '');
            const idField = indexConfig?.idField;
            
            // Use getById if:
            // 1. Argument is 'id' or '_id'
            // 2. OR idField is configured and argument name matches the idField
            // 3. OR for shops: if idField is 'shop' and argument is 'domain', use as ID (domain value = shop field value = document ID)
            const isIdLookup = 
              firstArg.name === 'id' || 
              firstArg.name === '_id' ||
              (idField && firstArg.name === idField) ||
              (returnTypeName === 'Shop' && idField === 'shop' && firstArg.name === 'domain');
            
            if (isIdLookup) {
              // ID-based lookup - use the argument value as document ID
              logger.info(`Using ID-based lookup for ${fieldName}`, {
                argName: firstArg.name,
                idField,
                type: returnTypeName,
                value: argValue,
                index: esService['repository']?.['index'],
              });
              result = await esService.getById(argValue);
              
              logger.info(`ID lookup result for ${fieldName}`, {
                found: !!result,
                hasData: result ? Object.keys(result).length : 0,
              });
              
              // If ID lookup fails and we have an idField, try field lookup as fallback
              // (e.g., shop(domain) where domain value should match shop field)
              if (!result && idField && returnTypeName === 'Shop' && firstArg.name === 'domain') {
                logger.info(`ID lookup failed, trying field lookup on ${idField}`, {
                  argName: firstArg.name,
                  idField,
                  value: argValue,
                });
                result = await esService.getByField(idField, argValue);
                
                logger.info(`Field lookup result for ${fieldName}`, {
                  found: !!result,
                  hasData: result ? Object.keys(result).length : 0,
                });
              }
            } else {
              // Field-based lookup
              logger.info(`Using field-based lookup for ${fieldName}`, {
                field: firstArg.name,
                type: returnTypeName,
                value: argValue,
                index: esService['repository']?.['index'],
              });
              result = await esService.getByField(firstArg.name, argValue);
              
              logger.info(`Field lookup result for ${fieldName}`, {
                found: !!result,
                hasData: result ? Object.keys(result).length : 0,
              });
            }
          } else {
            // No args - return null or error
            result = null;
          }
        }
      }

      return result;
    } catch (error: any) {
      logger.error(`Error in auto-resolver`, {
        field: fieldName,
        error: error?.message || error,
      });

      if (error.code) {
        throw error;
      }

      throw {
        code: 'INTERNAL_ERROR',
        message: error?.message || 'An error occurred',
      };
    }
  };
}

/**
 * Auto-generate resolvers from schema
 */
export function generateResolversFromSchema(schema: GraphQLSchema, esClient: Client): any {
  const resolvers: any = {
    Query: {},
    Mutation: {},
  };

  // Get Query type
  const queryType = schema.getQueryType();
  if (queryType) {
    const fields = queryType.getFields();
    Object.keys(fields).forEach(fieldName => {
      const field = fields[fieldName];
      const returnTypeName = getReturnTypeName(field.type);
      const args = field.args || [];

      resolvers.Query[fieldName] = generateAutoResolver(
        fieldName,
        field.type,
        Array.from(args),
        false,
        returnTypeName,
        esClient
      );

      logger.info(`Auto-generated Query resolver: ${fieldName}`, {
        fieldName,
        returnTypeName,
        args: Array.from(args).map(a => a.name),
      });
    });
  }

  // Get Mutation type
  const mutationType = schema.getMutationType();
  if (mutationType) {
    const fields = mutationType.getFields();
    Object.keys(fields).forEach(fieldName => {
      const field = fields[fieldName];
      const returnTypeName = getReturnTypeName(field.type);
      const args = field.args || [];

      resolvers.Mutation[fieldName] = generateAutoResolver(
        fieldName,
        field.type,
        Array.from(args),
        true,
        returnTypeName,
        esClient
      );

      logger.info(`Auto-generated Mutation resolver: ${fieldName}`);
    });
  }

  logger.info(`Auto-generated ${Object.keys(resolvers.Query).length} Query resolvers and ${Object.keys(resolvers.Mutation).length} Mutation resolvers`);

  return resolvers;
}


