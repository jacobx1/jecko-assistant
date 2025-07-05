import OpenAI from 'openai';
import { Config } from './schemas/config.js';
import { zodSchemaToOpenAIFunction } from './utils/zodToOpenAI.js';
import { Tool } from './utils/toolInfra.js';

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
  onToolCall?: (toolName: string, args: any) => void;
  onNewMessage?: () => void; // Called when starting a new assistant message
}

export class OpenAIClient {
  private client: OpenAI;
  private config: Config;
  private tools: Map<string, Tool<any, any>>;

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
  }

  async chat(
    messages: Message[],
    useTools: boolean = false,
    streamingCallbacks?: StreamingCallbacks
  ): Promise<ChatResponse> {
    const systemMessage: Message = {
      role: 'system',
      content:
        'You are Jecko, a helpful AI assistant. Use tools when needed to provide accurate and up-to-date information.',
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
        });

        let fullContent = '';
        let toolCalls: any[] = [];
        let accumulatedToolCalls: { [key: number]: any } = {};

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
        }

        // Convert accumulated tool calls to array
        toolCalls = Object.values(accumulatedToolCalls);

        // Handle tool calls if any - DON'T call onComplete yet if we have tool calls
        if (toolCalls.length > 0) {
          return await this.handleToolCalls(
            toolCalls,
            allMessages,
            streamingCallbacks
          );
        }

        // Only call onComplete if we don't have tool calls
        streamingCallbacks.onComplete?.();

        return {
          content: fullContent || 'No response content',
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

        // Handle tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          return await this.handleToolCalls(message.tool_calls, allMessages);
        }

        return {
          content: message.content || 'No response content',
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
    streamingCallbacks?: StreamingCallbacks
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
      });

      let finalContent = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          finalContent += delta.content;
          streamingCallbacks.onToken?.(delta.content);
        }
      }

      // Now call onComplete after the follow-up response is done
      streamingCallbacks.onComplete?.();

      return {
        content: finalContent || 'No response content',
        toolCalls: toolCallResults,
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

      return {
        content:
          finalCompletion.choices[0]?.message?.content || 'No response content',
        toolCalls: toolCallResults,
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
}
