import { z } from 'zod';

export const ConfigSchema = z.object({
  openai: z.object({
    apiKey: z.string().min(1, 'OpenAI API key is required'),
    model: z.string().default('gpt-4o'),
    baseURL: z.string().url().optional(),
  }),
  serper: z.object({
    apiKey: z.string().min(1, 'Serper API key is required'),
  }),
  maxTokens: z.number().positive().default(4000),
  temperature: z.number().min(0).max(2).default(0.7),
});

export type Config = z.infer<typeof ConfigSchema>;
