import { z } from 'zod';

export const WebSearchToolSchema = z.object({
  name: z.literal('web_search'),
  description: z.literal('Search the web for information'),
  parameters: z.object({
    query: z.string().min(1, 'Search query is required'),
    num_results: z.number().positive().max(20).default(10),
  }),
});

export const ToolParametersSchema = z.object({
  query: z.string().min(1),
  num_results: z.number().positive().max(20).default(10),
});

export type WebSearchTool = z.infer<typeof WebSearchToolSchema>;
export type ToolParameters = z.infer<typeof ToolParametersSchema>;