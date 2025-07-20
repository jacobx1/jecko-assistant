import React from 'react';
import { Box, Text } from 'ink';
import { CommandSelector } from './CommandSelector.js';

export type Mode = 'CHAT' | 'AGENT';

interface ChatInputProps {
  input: string;
  mode: Mode;
  showCommandSelector: boolean;
  commandQuery: string;
  selectedCommandIndex: number;
  showInformationalHeader: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  mode,
  showCommandSelector,
  commandQuery,
  selectedCommandIndex,
  showInformationalHeader,
}) => {
  return (
    <>
      {/* Header - only show when displaying informational content */}
      {showInformationalHeader && (
        <Box borderStyle="single" paddingX={1} marginBottom={1}>
          <Text bold color="cyan">
            Jecko Assistant
          </Text>
        </Box>
      )}

      {/* Input or Command Selector */}
      {showCommandSelector ? (
        <Box borderStyle="single" paddingX={1}>
          <CommandSelector
            query={commandQuery}
            selectedIndex={selectedCommandIndex}
          />
        </Box>
      ) : (
        <Box borderStyle="single" paddingX={1}>
          <Text color="green">{'> '}</Text>
          <Text>{input}</Text>
          <Text color="gray">█</Text>
        </Box>
      )}
    </>
  );
};