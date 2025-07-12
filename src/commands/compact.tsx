import React from 'react';
import { Box, Text } from 'ink';
import { SlashCommand } from './types.js';
import { Config } from '../schemas/config.js';

interface CompactDisplayProps {
  result: {
    tokensSaved: number;
    originalCount: number;
    compactedCount: number;
  };
}

const CompactDisplay: React.FC<CompactDisplayProps> = ({ result }) => {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🗜️ Conversation Compacted
        </Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text color="green">
          ✓ Compaction completed successfully
        </Text>
      </Box>

      <Box flexDirection="column" gap={1}>
        <Box>
          <Text color="gray">Messages: </Text>
          <Text color="yellow">{result.originalCount}</Text>
          <Text color="gray"> → </Text>
          <Text color="green">{result.compactedCount}</Text>
        </Box>
        
        <Box>
          <Text color="gray">Estimated tokens saved: </Text>
          <Text color="green">{result.tokensSaved.toLocaleString()}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          Older messages have been summarized to preserve context while saving tokens.
        </Text>
      </Box>
    </Box>
  );
};

export const compactCommand: SlashCommand = {
  name: 'compact',
  description: 'Compact conversation history to save context space',
  execute: async (config: Config) => {
    // This command will be handled specially in the chat component
    // since it needs access to messages and state
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="gray">
          Compaction will be handled by the chat interface...
        </Text>
      </Box>
    );
  },
};

export { CompactDisplay };