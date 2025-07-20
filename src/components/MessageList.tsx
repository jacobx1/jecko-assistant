import React from 'react';
import { Box, Text, Static } from 'ink';
import { StreamingText } from './StreamingText.js';

export interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: any;
  isStreaming?: boolean;
  isComplete?: boolean;
  tool_call_id?: string;
  tool_calls?: any[];
  isInternal?: boolean; // Flag for internal messages that shouldn't be displayed to user
  displayContent?: string; // User-friendly display content (separate from LLM content)
}

// Memoized message component to prevent unnecessary re-renders
const MessageItem = React.memo<{ message: Message; index: number }>(({ message }) => (
  <Box marginBottom={1}>
    <Text
      bold
      color={
        message.role === 'user'
          ? 'green'
          : message.role === 'tool'
            ? 'yellow'
            : message.role === 'system'
              ? 'gray'
              : 'blue'
      }
    >
      {message.role === 'user'
        ? '> '
        : message.role === 'tool'
          ? ''
          : message.role === 'system'
            ? 'System: '
            : 'Assistant: '}
    </Text>
    <Box>
      {message.role === 'assistant' && message.isStreaming ? (
        <StreamingText text={message.content} />
      ) : message.role === 'assistant' ? (
        <StreamingText text={message.content} />
      ) : (
        <Text color={message.role === 'tool' ? 'yellow' : message.role === 'system' ? 'gray' : 'white'}>
          {message.displayContent || message.content}
        </Text>
      )}
    </Box>
  </Box>
));

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  showInformationalHeader: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ 
  messages, 
  isLoading, 
  showInformationalHeader 
}) => {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {/* Show welcome message only when there are no messages and not in command mode */}
      {showInformationalHeader && (
        <Box flexDirection="column">
          <Text color="gray">
            Welcome! Type a message and press Enter to start.
          </Text>
          <Text color="gray">Type / to see available commands.</Text>
        </Box>
      )}
      
      {/* Use Static for completed messages to prevent re-renders - only when we have messages */}
      {messages.length > 0 && (
        <Static items={messages.filter(msg => msg.isComplete !== false && !msg.isInternal && msg.role !== 'system')}>
          {(msg, idx) => (
            <MessageItem key={`completed-${msg.timestamp}-${idx}-${msg.role}`} message={msg} index={idx} />
          )}
        </Static>
      )}
      
      {/* Render streaming/incomplete messages separately - only if not complete */}
      {messages
        .filter(msg => msg.isComplete === false && !msg.isInternal && msg.role !== 'system')
        .map((msg, idx) => (
          <MessageItem key={`streaming-${msg.timestamp}-${idx}-${msg.role}`} message={msg} index={idx} />
        ))}
      
      {isLoading && (
        <Box>
          <Text color="yellow">Assistant is thinking...</Text>
        </Box>
      )}
    </Box>
  );
};