import OpenAI from 'openai';
import { Config } from './schemas/config.js';
import { WebSearchTool } from './tools/serper.js';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    args: any;
    result: string;
  }>;
}

export interface StreamingCallbacks {
  onToken?: (token: string) => void;
  onComplete?: () => void;
}

export class OpenAIClient {
  private client: OpenAI;
  private config: Config;
  private tools: WebSearchTool;

  constructor(config: Config) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseURL,
    });
    this.tools = new WebSearchTool(config.serper.apiKey);
  }

  async chat(messages: Message[], useTools: boolean = false, streamingCallbacks?: StreamingCallbacks): Promise<ChatResponse> {
    const systemMessage: Message = {
      role: 'system',
      content: 'You are Jecko, a helpful AI assistant. Use tools when needed to provide accurate and up-to-date information.',
    };

    const allMessages = [systemMessage, ...messages];

    try {
      if (streamingCallbacks) {
        // Streaming mode
        const stream = await this.client.chat.completions.create({
          model: this.config.openai.model,
          messages: allMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          tools: useTools ? this.getToolDefinitions() : undefined,
          tool_choice: useTools ? 'auto' : undefined,
          stream: true,
        });

        let fullContent = '';
        let toolCalls: any[] = [];

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          
          if (delta?.content) {
            fullContent += delta.content;
            streamingCallbacks.onToken?.(delta.content);
          }
          
          if (delta?.tool_calls) {
            toolCalls.push(...delta.tool_calls);
          }
        }

        streamingCallbacks.onComplete?.();

        // Handle tool calls if any
        if (toolCalls.length > 0) {
          return await this.handleToolCalls(toolCalls, allMessages, streamingCallbacks);
        }

        return {
          content: fullContent || 'No response content'
        };
      } else {
        // Non-streaming mode (existing code)
        const completion = await this.client.chat.completions.create({
          model: this.config.openai.model,
          messages: allMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          tools: useTools ? this.getToolDefinitions() : undefined,
          tool_choice: useTools ? 'auto' : undefined,
        });

        const message = completion.choices[0]?.message;
        if (!message) {
          throw new Error('No response from OpenAI');
        }

        // Handle tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          return await this.handleToolCalls(message.tool_calls, allMessages);
        }

        return {
          content: message.content || 'No response content'
        };
      }
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleToolCalls(toolCalls: any[], messages: Message[], streamingCallbacks?: StreamingCallbacks): Promise<ChatResponse> {
    const toolCallResults = [];

    for (const toolCall of toolCalls) {
      if (toolCall.function.name === 'web_search') {
        try {
          const params = JSON.parse(toolCall.function.arguments);
          const result = await this.tools.execute(params);
          toolCallResults.push({
            name: 'web_search',
            args: params,
            result: result
          });
        } catch (error) {
          toolCallResults.push({
            name: 'web_search',
            args: JSON.parse(toolCall.function.arguments),
            result: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }
    }

    // Create a follow-up message with tool results
    const toolMessage: Message = {
      role: 'assistant',
      content: toolCallResults.map(tc => `Search results for "${tc.args.query}":\n${tc.result}`).join('\n\n')
    };

    const updatedMessages = [...messages, toolMessage];

    // Get final response incorporating tool results
    const finalCompletion = await this.client.chat.completions.create({
      model: this.config.openai.model,
      messages: updatedMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    return {
      content: finalCompletion.choices[0]?.message?.content || 'No response content',
      toolCalls: toolCallResults
    };
  }

  async chatWithTools(messages: Message[]): Promise<ChatResponse> {
    return await this.chat(messages, true);
  }

  private getToolDefinitions() {
    return [
      {
        type: 'function' as const,
        function: {
          name: 'web_search',
          description: 'Search the web for current information',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
              num_results: {
                type: 'number',
                description: 'Number of results to return (1-20)',
                default: 10,
              },
            },
            required: ['query'],
          },
        },
      },
    ];
  }
}