import { OpenAIClient } from '../openai.js';

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: any;
}

export interface CompactionResult {
  compactedMessages: Message[];
  tokensSaved: number;
  originalCount: number;
  compactedCount: number;
}

/**
 * Compacts conversation history by summarizing older messages while preserving recent context
 */
export class ConversationCompactor {
  private client: OpenAIClient;

  constructor(client: OpenAIClient) {
    this.client = client;
  }

  /**
   * Compacts messages by keeping recent messages and summarizing older ones
   * @param messages - Array of conversation messages
   * @param keepRecentCount - Number of recent message pairs to keep uncompacted (default: 3)
   * @returns CompactionResult with compacted messages and stats
   */
  async compact(messages: Message[], keepRecentCount: number = 3): Promise<CompactionResult> {
    // Filter out tool messages for compaction (they're ephemeral)
    const conversationMessages = messages.filter(msg => msg.role !== 'tool');
    
    if (conversationMessages.length <= keepRecentCount * 2) {
      // Not enough messages to compact
      return {
        compactedMessages: messages,
        tokensSaved: 0,
        originalCount: messages.length,
        compactedCount: messages.length,
      };
    }

    // Split messages into old (to compact) and recent (to keep)
    const messagesToCompact = conversationMessages.slice(0, -keepRecentCount * 2);
    const recentMessages = conversationMessages.slice(-keepRecentCount * 2);

    if (messagesToCompact.length === 0) {
      return {
        compactedMessages: messages,
        tokensSaved: 0,
        originalCount: messages.length,
        compactedCount: messages.length,
      };
    }

    // Create conversation text for summarization
    const conversationText = messagesToCompact
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    try {
      // Generate summary using OpenAI
      const summaryResponse = await this.client.chat([
        {
          role: 'system',
          content: 'You are a conversation summarizer. Create a concise but comprehensive summary of the conversation that preserves key context, decisions, and information. Focus on what would be important for continuing the conversation.',
        },
        {
          role: 'user',
          content: `Please summarize this conversation:\n\n${conversationText}`,
        },
      ], false);

      // Create a single summary message to replace the old messages
      const summaryMessage: Message = {
        role: 'assistant',
        content: `[Conversation Summary]\n${summaryResponse.content}`,
        timestamp: Date.now(),
      };

      // Combine summary with recent messages and any tool messages from the end
      const toolMessages = messages.filter(msg => msg.role === 'tool');
      const recentToolMessages = toolMessages.slice(-5); // Keep last 5 tool messages

      const compactedMessages: Message[] = [
        summaryMessage,
        ...recentToolMessages,
        ...recentMessages,
      ];

      return {
        compactedMessages,
        tokensSaved: this.estimateTokensSaved(messagesToCompact, summaryMessage),
        originalCount: messages.length,
        compactedCount: compactedMessages.length,
      };
    } catch (error) {
      console.error('Compaction failed:', error);
      // Return original messages if compaction fails
      return {
        compactedMessages: messages,
        tokensSaved: 0,
        originalCount: messages.length,
        compactedCount: messages.length,
      };
    }
  }

  /**
   * Rough estimation of tokens saved (4 characters ≈ 1 token)
   */
  private estimateTokensSaved(originalMessages: Message[], summaryMessage: Message): number {
    const originalLength = originalMessages.reduce((sum, msg) => sum + msg.content.length, 0);
    const summaryLength = summaryMessage.content.length;
    const charsSaved = Math.max(0, originalLength - summaryLength);
    return Math.round(charsSaved / 4);
  }
}