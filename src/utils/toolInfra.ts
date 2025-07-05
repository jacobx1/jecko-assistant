import { z } from 'zod';
import type { Config } from '../schemas/config.js';

export interface Tool<Name extends string, Schema extends z.ZodSchema> {
  execute: (params: z.infer<Schema>, config: Config) => Promise<string>;
  schema: Schema;
  name: Name;
  description: string;
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
