import React from 'react';
import { Box, Text } from 'ink';
import { SlashCommand } from './types.js';
import { Config } from '../schemas/config.js';

const ExitDisplay: React.FC = () => {
  return (
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
};

export const exitCommand: SlashCommand = {
  name: 'exit',
  description: 'Exit the application gracefully',
  execute: async (config: Config) => {
    // Show goodbye message briefly then exit
    setTimeout(() => {
      process.exit(0);
    }, 1000);
    
    return <ExitDisplay />;
  },
};