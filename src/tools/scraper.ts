import axios from 'axios';
import { z } from 'zod';
import { createTool } from '../utils/toolInfra.js';

const ScrapeResultSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  markdown: z.string().optional(),
  text: z.string().optional(),
  error: z.string().optional(),
});

export type ScrapeResult = z.infer<typeof ScrapeResultSchema>;

export const URLScraperTool = createTool({
  name: 'scrape_url',
  description:
    'Scrape content from a specific URL to get more detailed information',
  schema: z.object({
    url: z
      .string()
      .url()
      .describe('The URL to scrape content from (must be a valid URL)'),
    includeMarkdown: z
      .boolean()
      .default(true)
      .describe('Whether to include markdown formatting in the response'),
  }),
  execute: async ({ url, includeMarkdown }, config) => {
    const apiKey = config.serper.apiKey;
    const baseUrl = 'https://scrape.serper.dev';

    try {
      const requestData = {
        url,
        includeMarkdown,
      };

      const config = {
        method: 'post' as const,
        maxBodyLength: Infinity,
        url: baseUrl,
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        data: requestData,
        timeout: 30000, // 30 second timeout
      };

      const response = await axios.request(config);

      // Validate response structure
      const result = ScrapeResultSchema.parse(response.data);

      if (result.error) {
        throw new Error(`Scraping failed: ${result.error}`);
      }

      // Format the response for the LLM
      let formattedResult = `**URL:** ${result.url}\n`;

      if (result.title) {
        formattedResult += `**Title:** ${result.title}\n\n`;
      }

      if (result.markdown && includeMarkdown) {
        formattedResult += `**Content:**\n${result.markdown}`;
      } else if (result.text) {
        formattedResult += `**Content:**\n${result.text}`;
      } else {
        formattedResult += `**Content:** No content could be extracted from this URL.`;
      }

      return formattedResult;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('Scraping request timed out');
        }
        if (error.response?.status === 401) {
          throw new Error('Invalid Serper API key for scraping');
        }
        if (error.response?.status === 429) {
          throw new Error('Scraping rate limit exceeded');
        }
        if (error.response?.data?.error) {
          throw new Error(`Scraping failed: ${error.response.data.error}`);
        }
        throw new Error(`Scraping request failed: ${error.message}`);
      }

      throw new Error(
        `Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
});
