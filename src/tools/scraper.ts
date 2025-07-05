import axios from 'axios';
import { z } from 'zod';
import { ScrapeUrlParamsSchema, type ScrapeUrlParams } from '../schemas/tools.js';

const ScrapeResultSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  markdown: z.string().optional(),
  text: z.string().optional(),
  error: z.string().optional(),
});

export type ScrapeResult = z.infer<typeof ScrapeResultSchema>;

export class URLScraperTool {
  private apiKey: string;
  private baseUrl = 'https://scrape.serper.dev';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async execute(params: ScrapeUrlParams): Promise<string> {
    try {
      // Validate input parameters
      const validatedParams = ScrapeUrlParamsSchema.parse(params);

      const requestData = {
        url: validatedParams.url,
        includeMarkdown: validatedParams.includeMarkdown,
      };

      const config = {
        method: 'post' as const,
        maxBodyLength: Infinity,
        url: this.baseUrl,
        headers: {
          'X-API-KEY': this.apiKey,
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
      
      if (result.markdown && validatedParams.includeMarkdown) {
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
      
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => issue.message).join(', ');
        throw new Error(`Invalid scraping parameters: ${issues}`);
      }
      
      throw new Error(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}