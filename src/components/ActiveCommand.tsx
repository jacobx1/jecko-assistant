import React from 'react';
import { Box, Text } from 'ink';
import { ActiveCommandState, CompactionResult } from '../store/slices/uiSlice.js';

interface ActiveCommandProps {
  activeCommand: ActiveCommandState;
}

const ExitCommand: React.FC = () => (
  <Box flexDirection="column" paddingX={2} paddingY={1}>
    <Box marginBottom={1}>
      <Text bold color="cyan">
        👋 Goodbye!
      </Text>
    </Box>
    <Text color="gray">
      Thanks for using Jecko Assistant. Exiting...
    </Text>
  </Box>
);

const CompactCommand: React.FC<{ result: CompactionResult }> = ({ result }) => (
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

const GenericCommand: React.FC<{ type: string }> = ({ type }) => (
  <Box flexDirection="column" paddingX={2} paddingY={1}>
    <Text color="gray">
      Command "{type}" is active. Press ESC to close.
    </Text>
  </Box>
);

export const ActiveCommand: React.FC<ActiveCommandProps> = ({ activeCommand }) => {
  if (!activeCommand.type) {
    return null;
  }

  switch (activeCommand.type) {
    case 'exit':
      return <ExitCommand />;
    case 'compact':
      return (
        <CompactCommand 
          result={activeCommand.data?.compactionResult!} 
        />
      );
    case 'config':
    case 'tools':
    default:
      return <GenericCommand type={activeCommand.type} />;
  }
};