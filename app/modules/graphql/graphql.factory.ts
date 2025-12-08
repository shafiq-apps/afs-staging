/**
 * GraphQL Factory
 * Creates and wires up GraphQL module dependencies
 */

import { Client } from '@elastic/elasticsearch';
import { 
  GraphQLSchema, 
  buildSchema, 
  GraphQLObjectType,
  GraphQLString,
  GraphQLBoolean,
  GraphQLList,
  GraphQLID,
  GraphQLNonNull,
  GraphQLScalarType,
  Kind,
  ValueNode,
} from 'graphql';
import { GraphQLService, GraphQLServiceOptions } from './graphql.service';
import { GraphQLModule, GraphQLServiceDependencies } from './graphql.type';
import { createModuleLogger } from '@shared/utils/logger.util';
import { schemas as schemaStrings, defaultSchema } from './schema/index';
import { resolvers as resolverObjects, defaultResolvers } from './resolvers/index';
// Auto-resolver disabled - using manual resolvers only
// import { generateResolversFromSchema } from './graphql.auto-resolver';
import { initializeIndexConfig } from './graphql.index-config';
import { initializeHandlers } from './handlers';

const logger = createModuleLogger('graphql-factory', {disabled: true});

/**
 * Create default empty schema (to be extended by modules)
 */
function createDefaultSchema(): GraphQLSchema {
  const schemaString = `
    type Query {
      _empty: String
    }
    
    type Mutation {
      _empty: String
    }
  `;

  try {
    return buildSchema(schemaString);
  } catch (error: any) {
    logger.error('Failed to create default GraphQL schema', {
      error: error?.message || error,
    });
    throw new Error('Failed to initialize GraphQL schema');
  }
}

/**
 * Create JSON scalar type for nested objects
 */
function createJSONScalar(): GraphQLScalarType {
  return new GraphQLScalarType({
    name: 'JSON',
    description: 'JSON scalar type for nested objects',
    serialize(value: any): any {
      // Return value as-is (GraphQL will serialize it)
      return value;
    },
    parseValue(value: any): any {
      // Parse value from variables
      return value;
    },
    parseLiteral(ast: ValueNode): any {
      // Parse value from query literal
      switch (ast.kind) {
        case Kind.STRING:
        case Kind.BOOLEAN:
          return ast.value;
        case Kind.INT:
        case Kind.FLOAT:
          return parseFloat(ast.value);
        case Kind.OBJECT: {
          const value: any = {};
          ast.fields.forEach(field => {
            value[field.name.value] = createJSONScalar().parseLiteral(field.value);
          });
          return value;
        }
        case Kind.LIST:
          return ast.values.map(n => createJSONScalar().parseLiteral(n));
        case Kind.NULL:
          return null;
        default:
          return null;
      }
    },
  });
}

/**
 * Create default empty resolvers (to be extended by modules)
 */
function createDefaultResolvers(): any {
  return {
    Query: {
      _empty: () => null,
    },
    Mutation: {
      _empty: () => null,
    },
    JSON: createJSONScalar(),
  };
}

/**
 * Manually attach resolvers to schema
 * Since buildSchema doesn't support resolvers, we manually wire them by
 * accessing the schema's internal structure and replacing field resolvers
 */
function attachResolversToSchema(schema: GraphQLSchema, resolvers: any): GraphQLSchema {
  logger.info('Attaching resolvers to schema', {
    hasQueryResolvers: !!resolvers.Query,
    hasMutationResolvers: !!resolvers.Mutation,
    queryResolverKeys: resolvers.Query ? Object.keys(resolvers.Query) : [],
  });

  // Get the Query type from schema
  const queryType = schema.getQueryType();
  if (queryType && resolvers.Query) {
    const queryFields = queryType.getFields();
    const availableFields = Object.keys(queryFields);
    
    logger.debug('Query type fields', { 
      availableFields,
      resolverKeys: Object.keys(resolvers.Query),
    });
    
    // Attach resolvers to each field
    Object.keys(resolvers.Query).forEach(fieldName => {
      if (queryFields[fieldName] && resolvers.Query[fieldName]) {
        try {
          // Store existing resolver for debugging
          const existingResolver = (queryFields[fieldName] as any).resolve;
          
          // Wrap resolver to add logging
          const resolverFn = resolvers.Query[fieldName];
          (queryFields[fieldName] as any).resolve = async (...args: any[]) => {
            logger.log(`Query.${fieldName} called`, {
              fieldName,
              argsCount: args.length,
              hasParent: !!args[0],
              hasGraphQLArgs: !!args[1],
              hasContext: !!args[2],
              graphQLArgs: args[1] ? Object.keys(args[1]) : [],
              argValues: args[1],
            });
            
            logger.log(`Resolver called for Query.${fieldName}`, {
              fieldName,
              argsCount: args.length,
              hasParent: !!args[0],
              hasGraphQLArgs: !!args[1],
              hasContext: !!args[2],
              graphQLArgs: args[1] ? Object.keys(args[1]) : [],
              argValues: args[1],
            });
            try {
              const result = await resolverFn(...args);
              
              logger.log(`Query.${fieldName} result`, {
                fieldName,
                hasResult: !!result,
                resultType: typeof result,
                isNull: result === null,
                isUndefined: result === undefined,
              });
              
              logger.log(`Resolver result for Query.${fieldName}`, {
                fieldName,
                hasResult: !!result,
                resultType: typeof result,
                isNull: result === null,
                isUndefined: result === undefined,
              });
              return result;
            } catch (error: any) {
              logger.error(`Query.${fieldName} error`, {
                fieldName,
                error: error?.message || error,
                stack: error?.stack,
              });
              
              logger.error(`Resolver error for Query.${fieldName}`, {
                fieldName,
                error: error?.message || error,
              });
              throw error;
            }
          };
          
          logger.log('Attached resolver to Query field', { 
            fieldName,
            hadOriginalResolver: !!existingResolver,
            newResolverType: typeof resolverFn,
          });
        } catch (error: any) {
          logger.error('Failed to attach resolver to Query field', {
            fieldName,
            error: error?.message || error,
          });
        }
      } else {
        logger.warn('Query field not found in schema or resolver missing', {
          fieldName,
          fieldExists: !!queryFields[fieldName],
          resolverExists: !!resolvers.Query[fieldName],
          availableFields: Object.keys(queryFields),
          availableResolvers: Object.keys(resolvers.Query || {}),
        });
      }
    });
  } else {
    logger.warn('Query type or Query resolvers not available', {
      hasQueryType: !!queryType,
      hasQueryResolvers: !!resolvers.Query,
    });
  }

  // Get the Mutation type from schema
  const mutationType = schema.getMutationType();
  if (mutationType && resolvers.Mutation) {
    const mutationFields = mutationType.getFields();
    
    logger.info('Mutation type fields in schema', {
      availableFields: Object.keys(mutationFields),
      availableResolvers: Object.keys(resolvers.Mutation || {}),
    });
    
    // Attach resolvers to each field
    Object.keys(resolvers.Mutation).forEach(fieldName => {
      if (mutationFields[fieldName] && resolvers.Mutation[fieldName]) {
        // Replace the resolve function
        (mutationFields[fieldName] as any).resolve = resolvers.Mutation[fieldName];
        logger.info('Attached resolver to Mutation field', { fieldName });
      } else {
        logger.warn('Mutation field not found in schema or resolver missing', {
          fieldName,
          fieldExists: !!mutationFields[fieldName],
          resolverExists: !!resolvers.Mutation[fieldName],
          availableFields: Object.keys(mutationFields),
          availableResolvers: Object.keys(resolvers.Mutation || {}),
        });
      }
    });
  } else {
    logger.warn('Mutation type or Mutation resolvers not available', {
      hasMutationType: !!mutationType,
      hasMutationResolvers: !!resolvers.Mutation,
    });
  }

  // Attach scalar resolvers (like JSON)
  if (resolvers.JSON) {
    const jsonType = schema.getType('JSON');
    if (jsonType && jsonType instanceof GraphQLScalarType) {
      // Replace the scalar type with our custom one
      const jsonScalar = resolvers.JSON;
      // Update the scalar's methods
      if (jsonScalar.serialize) {
        (jsonType as any).serialize = jsonScalar.serialize;
      }
      if (jsonScalar.parseValue) {
        (jsonType as any).parseValue = jsonScalar.parseValue;
      }
      if (jsonScalar.parseLiteral) {
        (jsonType as any).parseLiteral = jsonScalar.parseLiteral;
      }
      logger.info('Attached JSON scalar resolver');
    } else {
      logger.warn('JSON scalar type not found in schema, creating custom scalar');
    }
  }

  // Attach other type resolvers (like custom types, etc.)
  Object.keys(resolvers).forEach(key => {
    if (key !== 'Query' && key !== 'Mutation' && key !== 'JSON') {
      const type = schema.getType(key);
      if (type) {
        if (type instanceof GraphQLObjectType) {
          const fields = type.getFields();
          Object.keys(resolvers[key]).forEach(fieldName => {
            if (fields[fieldName] && resolvers[key][fieldName]) {
              try {
                (fields[fieldName] as any).resolve = resolvers[key][fieldName];
                logger.debug('Attached resolver to type field', { type: key, fieldName });
              } catch (error: any) {
                logger.error('Failed to attach resolver to type field', {
                  type: key,
                  fieldName,
                  error: error?.message || error,
                });
              }
            }
          });
        } else {
          logger.debug('Type is not an ObjectType, skipping field resolver attachment', {
            type: key,
            typeKind: type.constructor.name,
          });
        }
      } else {
        logger.debug('Type not found in schema', { type: key });
      }
    }
  });

  logger.info('Resolver attachment completed');
  return schema;
}

/**
 * Combine multiple schemas into one
 * Merges Query and Mutation types from multiple schemas
 */
function combineSchemas(schemas: string[]): GraphQLSchema {
  if (schemas.length === 0) {
    return createDefaultSchema();
  }

  // Parse and merge Query/Mutation types from all schemas
  const queryFields: string[] = [];
  const mutationFields: string[] = [];
  const typeDefinitions: string[] = [];
  const inputDefinitions: string[] = [];
  const scalarDefinitions: string[] = [];
  const seenScalars = new Set<string>();

  schemas.forEach(schema => {
    const lines = schema.split('\n');
    let inQuery = false;
    let inMutation = false;
    let inType = false;
    let inInput = false;
    let inScalar = false;
    let currentBlock: string[] = [];
    let indentLevel = 0;

    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Detect Query type
      if (trimmed.startsWith('type Query')) {
        inQuery = true;
        inMutation = false;
        inType = false;
        inInput = false;
        inScalar = false;
        currentBlock = [line]; // Include the opening line so slice(1, -1) works correctly
        return;
      }
      
      // Detect Mutation type
      if (trimmed.startsWith('type Mutation')) {
        inQuery = false;
        inMutation = true;
        inType = false;
        inInput = false;
        inScalar = false;
        currentBlock = [line]; // Include the opening line
        return;
      }
      
      // Detect other types
      if (trimmed.startsWith('type ') && !trimmed.startsWith('type Query') && !trimmed.startsWith('type Mutation')) {
        inQuery = false;
        inMutation = false;
        inType = true;
        inInput = false;
        inScalar = false;
        currentBlock = [line];
        return;
      }
      
      // Detect input types
      if (trimmed.startsWith('input ')) {
        inQuery = false;
        inMutation = false;
        inType = false;
        inInput = true;
        inScalar = false;
        currentBlock = [line];
        return;
      }
      
      // Detect scalar types
      if (trimmed.startsWith('scalar ')) {
        const scalarName = trimmed.replace('scalar ', '').trim();
        if (!seenScalars.has(scalarName)) {
          seenScalars.add(scalarName);
          scalarDefinitions.push(line);
        }
        inQuery = false;
        inMutation = false;
        inType = false;
        inInput = false;
        inScalar = false;
        currentBlock = [];
        return;
      }
      
      // Collect lines for current block
      if (inQuery || inMutation || inType || inInput) {
        currentBlock.push(line);
        
        // Check for closing brace
        if (trimmed === '}' && currentBlock.length > 1) {
          if (inQuery) {
            // Extract field definitions (skip the "type Query {" line and closing brace)
            const fields = currentBlock.slice(1, -1).filter(l => l.trim() && !l.trim().startsWith('#'));
            queryFields.push(...fields);
          } else if (inMutation) {
            const fields = currentBlock.slice(1, -1).filter(l => l.trim() && !l.trim().startsWith('#'));
            logger.debug('Extracting mutation fields', {
              blockLength: currentBlock.length,
              fieldsFound: fields.length,
              fields: fields,
            });
            mutationFields.push(...fields);
          } else if (inType) {
            typeDefinitions.push(...currentBlock);
          } else if (inInput) {
            inputDefinitions.push(...currentBlock);
          }
          
          inQuery = false;
          inMutation = false;
          inType = false;
          inInput = false;
          currentBlock = [];
        }
      } else if (!inScalar) {
        // Other lines (comments, etc.) - keep them
        if (trimmed && !trimmed.startsWith('type ') && !trimmed.startsWith('input ') && !trimmed.startsWith('scalar ')) {
          typeDefinitions.push(line);
        }
      }
    });
  });

  // Build combined schema
  const combinedSchema = [
    ...typeDefinitions,
    '',
    ...inputDefinitions,
    '',
    ...scalarDefinitions,
    '',
    'type Query {',
    ...queryFields,
    '}',
    '',
    'type Mutation {',
    ...mutationFields,
    '}',
  ].join('\n');

  // Log the combined schema for debugging
  logger.info('Combined GraphQL schema', {
    schemaCount: schemas.length,
    queryFieldCount: queryFields.length,
    mutationFieldCount: mutationFields.length,
    mutationFields: mutationFields,
    combinedSchemaPreview: combinedSchema.substring(0, 1000),
  });

  try {
    return buildSchema(combinedSchema);
  } catch (error: any) {
    logger.error('Failed to combine GraphQL schemas', {
      error: error?.message || error,
      schemaCount: schemas.length,
      queryFields,
      mutationFields,
      combinedSchemaPreview: combinedSchema.substring(0, 1000),
    });
    throw new Error('Failed to combine GraphQL schemas');
  }
}

/**
 * Combine multiple resolver objects into one
 */
function combineResolvers(resolvers: any[]): any {
  if (resolvers.length === 0) {
    return createDefaultResolvers();
  }

  const combined: any = {
    Query: {},
    Mutation: {},
  };

  for (const resolver of resolvers) {
    if (resolver.Query) {
      Object.assign(combined.Query, resolver.Query);
    }
    if (resolver.Mutation) {
      Object.assign(combined.Mutation, resolver.Mutation);
    }
    // Handle other types (if any)
    Object.keys(resolver).forEach(key => {
      if (key !== 'Query' && key !== 'Mutation') {
        if (!combined[key]) {
          combined[key] = {};
        }
        Object.assign(combined[key], resolver[key]);
      }
    });
  }

  return combined;
}

/**
 * Create GraphQL module
 */
export function createGraphQLModule(
  esClient: Client,
  dependencies?: GraphQLServiceDependencies
): GraphQLModule {
  logger.info('Creating GraphQL module', {
    hasDependencies: !!dependencies,
    dependencyCount: dependencies ? Object.keys(dependencies).length : 0,
  });

  try {
    // Load schemas from schema/index.ts
    const schemasToUse = schemaStrings.length > 0 ? schemaStrings : [defaultSchema];
    
    // Initialize index configuration from schemas (parse @index annotations)
    initializeIndexConfig(schemasToUse);
    
    // Build combined schema
    const baseSchema = combineSchemas(schemasToUse);

    // Use manual resolvers only (auto-resolver is disabled for explicit control)
    // Each schema must have its own resolver file in resolvers/
    let resolversToUse: any[];
    if (resolverObjects.length > 0) {
      logger.log('Using manual resolvers (found in resolvers/index.ts)', {
        resolverCount: resolverObjects.length,
        resolverNames: resolverObjects.map((r: any) => ({
          queries: Object.keys(r.Query || {}),
          mutations: Object.keys(r.Mutation || {}),
        })),
      });
      resolversToUse = resolverObjects;
    } else {
      logger.warn('No manual resolvers found! All GraphQL queries will return null.');
      logger.warn('Please create manual resolvers in modules/graphql/resolvers/');
      logger.warn('Example: Create shops.resolvers.ts, products.resolvers.ts, etc.');
      resolversToUse = [];
    }

    logger.log('Loading GraphQL schemas and resolvers', {
      schemaCount: schemasToUse.length,
      manualResolverCount: resolverObjects.length,
      totalQueries: resolversToUse.reduce((sum, r) => sum + Object.keys(r.Query || {}).length, 0),
      totalMutations: resolversToUse.reduce((sum, r) => sum + Object.keys(r.Mutation || {}).length, 0),
    });

    // Build combined resolvers
    const combinedResolvers = combineResolvers(resolversToUse);

    // Register JSON scalar type if it exists in resolvers
    if (combinedResolvers.JSON) {
      const jsonScalar = createJSONScalar();
      // Add JSON scalar to schema's type map
      const typeMap = (baseSchema as any)._typeMap;
      if (typeMap) {
        typeMap.JSON = jsonScalar;
        logger.info('Registered JSON scalar type');
      }
    }

    // Manually attach resolvers to schema
    logger.debug('Attaching resolvers to schema', {
      resolverKeys: Object.keys(combinedResolvers),
      queryResolvers: combinedResolvers.Query ? Object.keys(combinedResolvers.Query) : [],
      mutationResolvers: combinedResolvers.Mutation ? Object.keys(combinedResolvers.Mutation) : [],
      hasJSONScalar: !!combinedResolvers.JSON,
    });

    const schema = attachResolversToSchema(baseSchema, combinedResolvers);

    // Create GraphQL service
    const serviceOptions: GraphQLServiceOptions = {
      schema,
      resolvers: combinedResolvers,
      maxQueryDepth: parseInt(process.env.GRAPHQL_MAX_DEPTH || '10', 10),
      maxQueryComplexity: parseInt(process.env.GRAPHQL_MAX_COMPLEXITY || '1000', 10),
      enableIntrospection: process.env.GRAPHQL_ENABLE_INTROSPECTION !== 'false',
    };

    const service = new GraphQLService(serviceOptions);

    // Initialize handlers with the service and schema
    initializeHandlers(service, schema);

    logger.info('GraphQL module created successfully', {
      handlerInitialized: true,
    });

    return {
      service,
      schema,
      resolvers: combinedResolvers,
    };
  } catch (error: any) {
    logger.error('Failed to create GraphQL module', {
      error: error?.message || error,
      stack: error?.stack,
    });
    throw new Error(`Failed to create GraphQL module: ${error?.message || error}`);
  }
}

