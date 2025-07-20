import axios from 'axios';
import { z } from 'zod';
import { createTool } from '../utils/toolInfra.js';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export interface SerperResponse {
  organic: SearchResult[];
  answerBox?: {
    answer: string;
    title: string;
    link: string;
  };
  knowledgeGraph?: {
    title: string;
    description: string;
  };
}

export const WebSearchTool = createTool({
  name: 'web_search',
  description: 'Search the web for current information',
  schema: z.object({
    query: z.string().min(1).describe('The search query'),
    num_results: z
      .number()
      .positive()
      .max(20)
      .default(10)
      .describe('Number of results to return (1-20)'),
  }),
  formatToolCall(params) {
    return `Searching: ${params.query}`;
  },
  execute: async ({ query, num_results }, config) => {
    const apiKey = config.serper.apiKey;
    const baseUrl = 'https://google.serper.dev/search';

    try {
      const response = await axios.post<SerperResponse>(
        baseUrl,
        {
          q: query,
          num: num_results,
        },
        {
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      return formatResults(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error(
            'Invalid Serper API key. Please check your configuration.'
          );
        }
        if (error.response?.status === 429) {
          throw new Error(
            'Serper API rate limit exceeded. Please try again later.'
          );
        }
        throw new Error(`Serper API error: ${error.message}`);
      }
      throw new Error(
        `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
});

function formatResults(data: SerperResponse): string {
  const results: string[] = [];

  // Add answer box if available
  if (data.answerBox) {
    results.push(`**Answer:** ${data.answerBox.answer}`);
    results.push(
      `**Source:** ${data.answerBox.title} - ${data.answerBox.link}`
    );
    results.push('');
  }

  // Add knowledge graph if available
  if (data.knowledgeGraph) {
    results.push(`**${data.knowledgeGraph.title}**`);
    results.push(data.knowledgeGraph.description);
    results.push('');
  }

  // Add organic results
  if (data.organic && data.organic.length > 0) {
    results.push('**Search Results:**');
    data.organic.forEach((result, index) => {
      results.push(`${index + 1}. **${result.title}**`);
      results.push(`   ${result.snippet}`);
      results.push(`   Link: ${result.link}`);
      results.push('');
    });
  }

  return results.join('\n').trim() || 'No search results found.';
}
