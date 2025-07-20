import React from 'react';
import { Box, Text } from 'ink';
import { SlashCommand } from './types.js';
import { Config } from '../schemas/config.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { store } from '../store/index.js';

export const debugCommand: SlashCommand = {
  name: 'debug',
  description: 'Dump all messages from history to messages.json',
  execute: async (config: Config) => {
    try {
      // Get current messages from Redux store
      const state = store.getState();
      const messages = state.chat.messages;
      
      // Write messages to messages.json in current working directory
      const outputPath = join(process.cwd(), 'messages.json');
      writeFileSync(outputPath, JSON.stringify(messages, null, 2));
      
      return (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Box marginBottom={1}>
            <Text bold color="green">
              🐛 Debug - Messages Dumped
            </Text>
          </Box>
          <Box>
            <Text color="cyan">
              Successfully wrote {messages.length} messages to messages.json
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">
              File location: {outputPath}
            </Text>
          </Box>
        </Box>
      );
    } catch (error) {
      return (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Box marginBottom={1}>
            <Text bold color="red">
              🐛 Debug - Error
            </Text>
          </Box>
          <Box>
            <Text color="red">
              Failed to write messages: {error instanceof Error ? error.message : 'Unknown error'}
            </Text>
          </Box>
        </Box>
      );
    }
  },
};