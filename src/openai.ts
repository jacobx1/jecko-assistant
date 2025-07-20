import OpenAI from 'openai';
import { Config } from './schemas/config.js';
import { zodSchemaToOpenAIFunction } from './utils/zodToOpenAI.js';
import { Tool } from './utils/toolInfra.js';
import { MCPClientManager } from './mcpClient.js';

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
  isInternal?: boolean;
  displayContent?: string;
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
  messagesToAdd?: Message[];
}

export interface StreamingCallbacks {
  onToken?: (token: string) => void;
  onComplete?: () => void;
  onToolCall?: (toolName: string, args: any, tool?: Tool<any, any>) => void;
  onNewMessage?: () => void; // Called when starting a new assistant message
  onUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }) => void;
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
    this.initializeMCPClients().catch((error) => {
      console.error('Failed to initialize MCP clients:', error);
    });
  }

  // Static factory method for when you need to wait for MCP initialization
  static async create(
    config: Config,
    tools: Tool<any, any>[]
  ): Promise<OpenAIClient> {
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
          console.warn(
            `Tool name conflict: ${tool.name} exists in both built-in and MCP tools. MCP tool will override.`
          );
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
  getAllTools(): {
    name: string;
    description: string;
    source: 'built-in' | 'mcp';
  }[] {
    const builtInToolNames = ['web_search', 'scrape_url', 'file_writer'];
    const allTools: {
      name: string;
      description: string;
      source: 'built-in' | 'mcp';
    }[] = [];

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
    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const systemMessage: Message = {
      role: 'system',
      content: isAgentMode
        ? `You are Jecko, a helpful AI assistant operating in agent mode. Your goal is to complete the given task thoroughly by chaining multiple tools and analysis steps.

CONTEXT INFORMATION:
- Today's date: ${currentDate}
- You have access to web search, URL scraping, file writing, and Todoist integration tools
- You can create and manage execution plans to organize complex tasks

IMPORTANT WORKFLOW:
1. For complex tasks, ALWAYS start by using "agent_plan_create" to break down the request into clear steps
2. Use "agent_plan_update" to mark steps as in_progress/completed and track your progress
3. When the task is COMPLETELY finished, use "agent_done" to signal completion with a summary
4. These agent planning tools (agent_plan_*, agent_done) are for YOUR organization, NOT external productivity tools like Todoist

ITERATION MANAGEMENT:
- You have a maximum of 25 iterations to complete your task
- You will be notified of remaining iterations in continuation prompts
- Plan your work efficiently and prioritize the most important actions
- When you have few iterations left, focus on completing your task and calling "agent_done"
- On the final iteration, you MUST call "agent_done" to provide a summary

CRITICAL TOOL USAGE: Use the function calling system to invoke tools - do NOT write tool calls as text. Call tools using the provided function calling interface, not by writing "tool_name: {parameters}" in your response.

CRITICAL: Always explicitly call "agent_done" when you have fully accomplished the user's request. This prevents unnecessary cycling and clearly signals task completion. You can do analysis or thinking between tool calls - this won't end the conversation unless you call "agent_done".

Always continue using tools and gathering information until you have fully addressed the user's request. Don't stop after the first tool call - keep investigating, analyzing, and taking actions until the task is comprehensively complete.`
        : `You are Jecko, a helpful AI assistant. 

CONTEXT INFORMATION:
- Today's date: ${currentDate}
- You have access to web search, URL scraping, file writing, and Todoist integration tools

Use tools when needed to provide accurate and up-to-date information.`,
    };

    const allMessages = [systemMessage, ...messages];

    try {
      if (streamingCallbacks) {
        // Streaming mode
        const stream = await this.client.chat.completions.create({
          model: this.config.openai.model,
          messages: allMessages.map((msg) => {
            if (msg.role === 'tool') {
              return {
                role: 'tool' as const,
                content: msg.content,
                tool_call_id: msg.tool_call_id!,
              };
            } else if (msg.role === 'assistant' && msg.tool_calls) {
              return {
                role: msg.role,
                content: msg.content,
                tool_calls: msg.tool_calls,
              };
            } else {
              return {
                role: msg.role,
                content: msg.content,
              };
            }
          }),
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
        let usage:
          | {
              promptTokens: number;
              completionTokens: number;
              totalTokens: number;
            }
          | undefined;

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
          const toolResult = await this.executeToolCalls(
            toolCalls,
            streamingCallbacks
          );

          // Signal completion of initial response
          streamingCallbacks.onComplete?.();

          return {
            content: fullContent || 'No response content',
            usage,
            toolCalls: toolResult.toolCallResults,
            messagesToAdd: toolResult.messagesToAdd,
          };
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
          messages: allMessages.map((msg) => {
            if (msg.role === 'tool') {
              return {
                role: 'tool' as const,
                content: msg.content,
                tool_call_id: msg.tool_call_id!,
              };
            } else if (msg.role === 'assistant' && msg.tool_calls) {
              return {
                role: msg.role,
                content: msg.content,
                tool_calls: msg.tool_calls,
              };
            } else {
              return {
                role: msg.role,
                content: msg.content,
              };
            }
          }),
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          tools: useTools ? this.getToolDefinitions() : undefined,
          tool_choice: useTools ? 'auto' : undefined,
        });

        const message = completion.choices[0]?.message;
        if (!message) {
          throw new Error('No response from OpenAI');
        }

        const usage = completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined;

        // Handle tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          const toolResult = await this.executeToolCalls(message.tool_calls);

          return {
            content: message.content || 'No response content',
            usage,
            toolCalls: toolResult.toolCallResults,
            messagesToAdd: toolResult.messagesToAdd,
          };
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

  private async executeToolCalls(
    toolCalls: any[],
    streamingCallbacks?: StreamingCallbacks
  ): Promise<{
    toolCallResults: Array<{
      name: string;
      args: any;
      result: string;
    }>;
    messagesToAdd: Message[];
  }> {
    const toolCallResults: Array<{
      name: string;
      args: any;
      result: string;
    }> = [];

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
        streamingCallbacks?.onToolCall?.(toolName, params, tool);

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
        streamingCallbacks?.onToolCall?.(toolName, args, tool);

        toolCallResults.push({
          name: toolName,
          args: args,
          result: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    // First, add the assistant message with tool calls
    const assistantToolCallMessage: Message = {
      role: 'assistant',
      content: '', // Tool calls don't need content
      tool_calls: toolCalls,
    };

    // Then, add tool response messages for each tool call
    const toolResponseMessages: Message[] = toolCalls.map(
      (toolCall, index) => ({
        role: 'tool',
        content: toolCallResults[index]?.result || 'Tool execution failed',
        tool_call_id: toolCall.id,
      })
    );

    return {
      toolCallResults,
      messagesToAdd: [assistantToolCallMessage, ...toolResponseMessages],
    };
  }

  async chatWithTools(messages: Message[]): Promise<ChatResponse> {
    return await this.chat(messages, true);
  }

  private getToolDefinitions() {
    const toolDefs = Array.from(this.tools.values()).map((tool) =>
      zodSchemaToOpenAIFunction(tool.name, tool.description, tool.schema)
    );

    return toolDefs;
  }

  /**
   * Estimates token usage when not provided by the API
   * Rough estimation: ~4 characters per token
   */
  private estimateTokenUsage(
    messages: Message[],
    responseContent: string
  ): { promptTokens: number; completionTokens: number; totalTokens: number } {
    const promptText = messages.map((msg) => msg.content).join(' ');
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
