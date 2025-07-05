import { z } from 'zod';

// Web Search Tool Schema
export const WebSearchParamsSchema = z.object({
  query: z.string().min(1).describe('The search query'),
  num_results: z
    .number()
    .positive()
    .max(20)
    .default(10)
    .describe('Number of results to return (1-20)'),
});

// URL Scraper Tool Schema
export const ScrapeUrlParamsSchema = z.object({
  url: z
    .string()
    .url()
    .describe('The URL to scrape content from (must be a valid URL)'),
  includeMarkdown: z
    .boolean()
    .default(true)
    .describe('Whether to include markdown formatting in the response'),
});

// File Writer Tool Schema
export const WriteFileParamsSchema = z.object({
  filename: z
    .string()
    .min(1)
    .describe('The name of the file to write (including extension)'),
  content: z.string().describe('The content to write to the file'),
  directory: z
    .string()
    .default('.')
    .describe(
      'The directory to write the file to (defaults to current directory)'
    ),
});

// Tool definitions with metadata
export const TOOL_DEFINITIONS = {
  web_search: {
    name: 'web_search',
    description: 'Search the web for current information',
    schema: WebSearchParamsSchema,
  },
  scrape_url: {
    name: 'scrape_url',
    description:
      'Scrape content from a specific URL to get more detailed information',
    schema: ScrapeUrlParamsSchema,
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to a file on the local filesystem',
    schema: WriteFileParamsSchema,
  },
} as const;

// Export parameter types
export type WebSearchParams = z.infer<typeof WebSearchParamsSchema>;
export type ScrapeUrlParams = z.infer<typeof ScrapeUrlParamsSchema>;
export type WriteFileParams = z.infer<typeof WriteFileParamsSchema>;

// Legacy exports for backward compatibility
export const ToolParametersSchema = WebSearchParamsSchema;
export type ToolParameters = WebSearchParams;
