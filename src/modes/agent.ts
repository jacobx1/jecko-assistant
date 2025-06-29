import { OpenAIClient, Message, ChatResponse, StreamingCallbacks } from '../openai.js';

export class AgentMode {
  static async execute(
    client: OpenAIClient,
    previousMessages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>,
    userInput: string,
    streamingCallbacks?: StreamingCallbacks
  ): Promise<ChatResponse> {
    const messages: Message[] = [
      ...previousMessages
        .filter(msg => msg.role !== 'tool') // Filter out tool messages for OpenAI
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      {
        role: 'user',
        content: userInput,
      },
    ];

    const responses: string[] = [];
    const allToolCalls: any[] = [];
    let currentMessages = [...messages];
    let iteration = 0;
    const maxIterations = 5; // Prevent infinite loops

    while (iteration < maxIterations) {
      const result = await client.chat(currentMessages, true, streamingCallbacks);
      responses.push(result.content);

      // Collect tool calls
      if (result.toolCalls) {
        allToolCalls.push(...result.toolCalls);
      }

      // If no tool calls were made, we're done
      if (!result.toolCalls || result.toolCalls.length === 0) {
        break;
      }

      // Add the assistant's response to the conversation
      currentMessages.push({
        role: 'assistant',
        content: result.content,
      });

      // Add a follow-up prompt to continue the conversation
      currentMessages.push({
        role: 'user',
        content: 'Please continue with any additional analysis or actions needed based on the information gathered.',
      });

      iteration++;
    }

    if (iteration >= maxIterations) {
      responses.push('\n[Agent mode reached maximum iterations limit]');
    }

    return {
      content: responses.join('\n\n'),
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined
    };
  }
}