/**
 * GraphQL Utilities
 * Framework-level utilities for GraphQL operations
 */

/**
 * Normalize GraphQL node structure
 * Recursively normalizes GraphQL connections and nodes
 * 
 * @param input - GraphQL node or connection object
 * @returns Normalized node structure
 * 
 * @example
 * normalizeGraphQLNode({ edges: [{ node: {...} }] }) // [{...}]
 */
export function normalizeGraphQLNode<T = any>(input: T): T {
  if (input === null || input === undefined) return input;

  if (Array.isArray(input)) {
    return input.map((item) => normalizeGraphQLNode(item)) as T;
  }

  if (typeof input === 'object') {
    const obj = input as Record<string, any>;

    if (Array.isArray(obj.edges)) {
      return obj.edges.map((edge: any) => normalizeGraphQLNode(edge.node)) as T;
    }

    if (Array.isArray(obj.nodes)) {
      return obj.nodes.map((node: any) => normalizeGraphQLNode(node)) as T;
    }

    const normalized: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      normalized[key] = normalizeGraphQLNode(obj[key]);
    }
    return normalized as T;
  }

  return input;
}

