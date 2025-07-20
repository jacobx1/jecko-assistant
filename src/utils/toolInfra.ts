import { z } from 'zod';
import type { Config } from '../schemas/config.js';

export interface Tool<Name extends string, Schema extends z.ZodSchema> {
  execute: (params: z.infer<Schema>, config: Config) => Promise<string>;
  schema: Schema;
  name: Name;
  description: string;
  formatToolCall?: (params: z.infer<Schema>) => string;
}

export function createTool<Name extends string, Schema extends z.ZodSchema>(
  tool: Tool<Name, Schema>
): Tool<Name, Schema> {
  return {
    ...tool,
    execute: async (params, config) => {
      const validatedParams = tool.schema.parse(params);
      return tool.execute(validatedParams, config);
    },
  };
}

// Helper function to format tool call display
export function formatToolCallDisplay(toolName: string, args: any, tool?: Tool<any, any>): string {
  // Use custom formatter if available
  if (tool?.formatToolCall) {
    try {
      return tool.formatToolCall(args);
    } catch (error) {
      console.warn(`Error formatting tool call for ${toolName}:`, error);
    }
  }
  
  // Default formatters for built-in tools
  switch (toolName) {
    case 'web_search':
      return `🔍 Searching: "${args.query}"`;
    case 'scrape_url':
      return `🔧 Scraping: "${args.url}"`;
    case 'file_writer':
      return `💾 Writing: "${args.filename}"`;
    default:
      // Fallback to generic format
      return `🔧 ${toolName}: ${JSON.stringify(args)}`;
  }
}

// Convert Zod schema to JSON Schema for MCP
export function zodToJsonSchema(schema: z.ZodSchema): any {
  // Simple conversion - extend this as needed
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: any = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      if (value instanceof z.ZodString) {
        properties[key] = {
          type: 'string',
          description: value.description || '',
        };
        if (value._def.checks?.some((check: any) => check.kind === 'url')) {
          properties[key].format = 'uri';
        }
      } else if (value instanceof z.ZodNumber) {
        properties[key] = {
          type: 'number',
          description: value.description || '',
        };
        if (value._def.checks) {
          const minCheck = value._def.checks.find((check: any) => check.kind === 'min');
          const maxCheck = value._def.checks.find((check: any) => check.kind === 'max');
          if (minCheck && 'value' in minCheck) properties[key].minimum = minCheck.value;
          if (maxCheck && 'value' in maxCheck) properties[key].maximum = maxCheck.value;
        }
      } else if (value instanceof z.ZodBoolean) {
        properties[key] = {
          type: 'boolean',
          description: value.description || '',
        };
      } else if (value instanceof z.ZodDefault) {
        const innerSchema = zodToJsonSchema(value._def.innerType);
        properties[key] = {
          ...innerSchema,
          default: value._def.defaultValue(),
        };
      } else if (value instanceof z.ZodOptional) {
        properties[key] = zodToJsonSchema(value._def.innerType);
      } else {
        // Fallback for other types
        properties[key] = {
          type: 'string',
          description: (value as any).description || '',
        };
      }
      
      // Check if field is required (not optional and not default)
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    
    return {
      type: 'object',
      properties,
      required,
    };
  }
  
  // Fallback for non-object schemas
  return { type: 'string' };
}

// Convert Tool to MCP tool definition
export function toolToMCPDefinition(tool: Tool<any, any>) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.schema),
  };
}
