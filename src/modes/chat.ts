import {
  OpenAIClient,
  Message,
  ChatResponse,
  StreamingCallbacks,
} from '../openai.js';

export class ChatMode {
  static async execute(
    client: OpenAIClient,
    previousMessages: Array<{
      role: 'user' | 'assistant' | 'tool' | 'system';
      content: string;
      tool_call_id?: string;
      tool_calls?: any[];
      isInternal?: boolean;
      displayContent?: string;
    }>,
    userInput: string,
    streamingCallbacks?: StreamingCallbacks
  ): Promise<ChatResponse> {
    let messages: Message[] = [
      ...previousMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
        content: msg.content, // Always use content for LLM, not displayContent
        tool_call_id: msg.tool_call_id,
        tool_calls: msg.tool_calls,
        isInternal: msg.isInternal,
        displayContent: msg.displayContent,
      })),
      {
        role: 'user',
        content: userInput,
      },
    ];

    // Keep making calls until we get a response without tool calls
    let finalResponse: ChatResponse;
    let allToolCalls: any[] = [];
    
    while (true) {
      const response = await client.chat(messages, true, streamingCallbacks);
      
      // If we have tool calls, add the messages to our conversation and continue
      if (response.messagesToAdd && response.messagesToAdd.length > 0) {
        messages.push(...response.messagesToAdd);
        if (response.toolCalls) {
          allToolCalls.push(...response.toolCalls);
        }
        
        // Signal that we need a new assistant message for follow-up
        streamingCallbacks?.onNewMessage?.();
        
        // Continue the loop to get follow-up response
        continue;
      }
      
      // No tool calls, this is our final response
      finalResponse = response;
      break;
    }
    
    // Include all tool calls in the final response
    if (allToolCalls.length > 0) {
      finalResponse.toolCalls = allToolCalls;
    }
    
    return finalResponse;
  }
}
