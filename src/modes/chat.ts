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
      role: 'user' | 'assistant' | 'tool';
      content: string;
    }>,
    userInput: string,
    streamingCallbacks?: StreamingCallbacks
  ): Promise<ChatResponse> {
    const messages: Message[] = [
      ...previousMessages
        .filter((msg) => msg.role !== 'tool') // Filter out tool messages for OpenAI
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      {
        role: 'user',
        content: userInput,
      },
    ];

    return await client.chat(messages, true, streamingCallbacks);
  }
}
