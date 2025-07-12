import OpenAI from 'openai';
import { Config } from './schemas/config.js';
import { zodSchemaToOpenAIFunction } from './utils/zodToOpenAI.js';
import { Tool } from './utils/toolInfra.js';
import { MCPClientManager } from './mcpClient.js';

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
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamingCallbacks {
  onToken?: (token: string) => void;
  onComplete?: () => void;
  onToolCall?: (toolName: string, args: any) => void;
  onNewMessage?: () => void; // Called when starting a new assistant message
  onUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void;
}

export class OpenAIClient {
  private client: OpenAI;
  private config: Config;
  private tools: Map<string, Tool<any, any>>;
  private mcpManager: MCPClientManager;

  constructor(config: Config, tools: Tool<any, any>[]) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseURL,
    });

    // Create a map of tool names to tool instances
    this.tools = new Map();
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }

    // Initialize MCP client manager
    this.mcpManager = new MCPClientManager();
    // Note: MCP initialization is async and happens in background
    this.initializeMCPClients().catch(error => {
      console.error('Failed to initialize MCP clients:', error);
    });
  }

  // Static factory method for when you need to wait for MCP initialization
  static async create(config: Config, tools: Tool<any, any>[]): Promise<OpenAIClient> {
    const client = new OpenAIClient(config, tools);
    await client.initializeMCPClients();
    return client;
  }

  private async initializeMCPClients() {
    try {
      await this.mcpManager.initialize(this.config);
      
      // Add MCP tools to our tools map (without prefix since OpenAI calls them by original name)
      const mcpTools = this.mcpManager.createToolWrappers();
      for (const tool of mcpTools) {
        // Check for name conflicts and warn if any
        if (this.tools.has(tool.name)) {
          console.warn(`Tool name conflict: ${tool.name} exists in both built-in and MCP tools. MCP tool will override.`);
        }
        this.tools.set(tool.name, tool);
      }
    } catch (error) {
      console.error('Failed to initialize MCP clients:', error);
    }
  }

  async disconnect() {
    await this.mcpManager.disconnect();
  }

  // Method to get all available tools for display purposes
  getAllTools(): { name: string; description: string; source: 'built-in' | 'mcp' }[] {
    const builtInToolNames = ['web_search', 'scrape_url', 'file_writer'];
    const allTools: { name: string; description: string; source: 'built-in' | 'mcp' }[] = [];
    
    for (const [name, tool] of this.tools) {
      allTools.push({
        name,
        description: tool.description,
        source: builtInToolNames.includes(name) ? 'built-in' : 'mcp',
      });
    }
    
    return allTools;
  }

  async chat(
    messages: Message[],
    useTools: boolean = false,
    streamingCallbacks?: StreamingCallbacks,
    isAgentMode: boolean = false
  ): Promise<ChatResponse> {
    const systemMessage: Message = {
      role: 'system',
      content: isAgentMode
        ? 'You are Jecko, a helpful AI assistant operating in agent mode. Your goal is to complete the given task thoroughly by chaining multiple tools and analysis steps. Always continue using tools and gathering information until you have fully addressed the user\'s request. Don\'t stop after the first tool call - keep investigating, analyzing, and taking actions until the task is comprehensively complete. Use tools aggressively to gather all necessary information and complete all aspects of the task.'
        : 'You are Jecko, a helpful AI assistant. Use tools when needed to provide accurate and up-to-date information.',
    };

    const allMessages = [systemMessage, ...messages];

    try {
      if (streamingCallbacks) {
        // Streaming mode
        const stream = await this.client.chat.completions.create({
          model: this.config.openai.model,
          messages: allMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          tools: useTools ? this.getToolDefinitions() : undefined,
          tool_choice: useTools ? 'auto' : undefined,
          stream: true,
          stream_options: { include_usage: true }, // Request usage info in streaming
        });

        let fullContent = '';
        let toolCalls: any[] = [];
        let accumulatedToolCalls: { [key: number]: any } = {};
        let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            fullContent += delta.content;
            streamingCallbacks.onToken?.(delta.content);
          }

          if (delta?.tool_calls) {
            for (const toolCall of delta.tool_calls) {
              const index = toolCall.index;
              if (!accumulatedToolCalls[index]) {
                accumulatedToolCalls[index] = {
                  id: toolCall.id,
                  type: toolCall.type,
                  function: { name: '', arguments: '' },
                };
              }

              if (toolCall.function?.name) {
                accumulatedToolCalls[index].function.name +=
                  toolCall.function.name;
              }

              if (toolCall.function?.arguments) {
                accumulatedToolCalls[index].function.arguments +=
                  toolCall.function.arguments;
              }
            }
          }

          // Capture usage information from the final chunk
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            };
            streamingCallbacks.onUsage?.(usage);
          }
        }

        // Convert accumulated tool calls to array
        toolCalls = Object.values(accumulatedToolCalls);

        // Handle tool calls if any - DON'T call onComplete yet if we have tool calls
        if (toolCalls.length > 0) {
          return await this.handleToolCalls(
            toolCalls,
            allMessages,
            streamingCallbacks,
            usage
          );
        }

        // Only call onComplete if we don't have tool calls
        streamingCallbacks.onComplete?.();

        // If no usage was provided by the stream, estimate it
        if (!usage) {
          usage = this.estimateTokenUsage(allMessages, fullContent);
          streamingCallbacks.onUsage?.(usage);
        }

        return {
          content: fullContent || 'No response content',
          usage,
        };
      } else {
        // Non-streaming mode (existing code)
        const completion = await this.client.chat.completions.create({
          model: this.config.openai.model,
          messages: allMessages.map((msg) => ({
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

        const usage = completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        } : undefined;

        // Handle tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          return await this.handleToolCalls(message.tool_calls, allMessages, undefined, usage);
        }

        return {
          content: message.content || 'No response content',
          usage,
        };
      }
    } catch (error) {
      throw new Error(
        `OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleToolCalls(
    toolCalls: any[],
    messages: Message[],
    streamingCallbacks?: StreamingCallbacks,
    initialUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  ): Promise<ChatResponse> {
    const toolCallResults = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const tool = this.tools.get(toolName);

      if (!tool) {
        console.warn(`Unknown tool: ${toolName}`);
        continue;
      }

      try {
        const params = JSON.parse(toolCall.function.arguments);

        // Notify that we're making a tool call
        streamingCallbacks?.onToolCall?.(toolName, params);

        const result = await tool.execute(params, this.config);
        toolCallResults.push({
          name: toolName,
          args: params,
          result: result,
        });
      } catch (error) {
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (jsonError) {
          console.error(
            'Failed to parse tool arguments:',
            toolCall.function.arguments
          );
        }

        // Notify about the tool call even if it fails
        streamingCallbacks?.onToolCall?.(toolName, args);

        toolCallResults.push({
          name: toolName,
          args: args,
          result: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    // Create a follow-up message with tool results
    const toolMessage: Message = {
      role: 'assistant',
      content: toolCallResults
        .map((tc) => `Results for "${tc.name}":\n${tc.result}`)
        .join('\n\n'),
    };

    const updatedMessages = [...messages, toolMessage];

    // Get final response incorporating tool results
    if (streamingCallbacks) {
      // Signal that we need a new message for the follow-up response
      streamingCallbacks.onNewMessage?.();

      // Use streaming for the follow-up response too
      const stream = await this.client.chat.completions.create({
        model: this.config.openai.model,
        messages: updatedMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: true,
        stream_options: { include_usage: true }, // Request usage info in streaming
      });

      let finalContent = '';
      let followUpUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
      
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          finalContent += delta.content;
          streamingCallbacks.onToken?.(delta.content);
        }
        
        if (chunk.usage) {
          followUpUsage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }
      }

      // Combine usage from initial call and follow-up
      let combinedUsage = initialUsage && followUpUsage ? {
        promptTokens: initialUsage.promptTokens + followUpUsage.promptTokens,
        completionTokens: initialUsage.completionTokens + followUpUsage.completionTokens,
        totalTokens: initialUsage.totalTokens + followUpUsage.totalTokens,
      } : (followUpUsage || initialUsage);

      // If no usage was captured, estimate it
      if (!combinedUsage) {
        combinedUsage = this.estimateTokenUsage(updatedMessages, finalContent);
      }

      if (combinedUsage) {
        streamingCallbacks.onUsage?.(combinedUsage);
      }

      // Now call onComplete after the follow-up response is done
      streamingCallbacks.onComplete?.();

      return {
        content: finalContent || 'No response content',
        toolCalls: toolCallResults,
        usage: combinedUsage,
      };
    } else {
      // Non-streaming follow-up
      const finalCompletion = await this.client.chat.completions.create({
        model: this.config.openai.model,
        messages: updatedMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const followUpUsage = finalCompletion.usage ? {
        promptTokens: finalCompletion.usage.prompt_tokens,
        completionTokens: finalCompletion.usage.completion_tokens,
        totalTokens: finalCompletion.usage.total_tokens,
      } : undefined;

      const combinedUsage = initialUsage && followUpUsage ? {
        promptTokens: initialUsage.promptTokens + followUpUsage.promptTokens,
        completionTokens: initialUsage.completionTokens + followUpUsage.completionTokens,
        totalTokens: initialUsage.totalTokens + followUpUsage.totalTokens,
      } : (followUpUsage || initialUsage);

      return {
        content:
          finalCompletion.choices[0]?.message?.content || 'No response content',
        toolCalls: toolCallResults,
        usage: combinedUsage,
      };
    }
  }

  async chatWithTools(messages: Message[]): Promise<ChatResponse> {
    return await this.chat(messages, true);
  }

  private getToolDefinitions() {
    return Array.from(this.tools.values()).map((tool) =>
      zodSchemaToOpenAIFunction(tool.name, tool.description, tool.schema)
    );
  }

  /**
   * Estimates token usage when not provided by the API
   * Rough estimation: ~4 characters per token
   */
  private estimateTokenUsage(
    messages: Message[],
    responseContent: string
  ): { promptTokens: number; completionTokens: number; totalTokens: number } {
    const promptText = messages.map(msg => msg.content).join(' ');
    const promptChars = promptText.length;
    const responseChars = responseContent.length;
    
    const promptTokens = Math.ceil(promptChars / 4);
    const completionTokens = Math.ceil(responseChars / 4);
    const totalTokens = promptTokens + completionTokens;
    
    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }
}
