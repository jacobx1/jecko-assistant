import React from 'react';
import { Box, Text } from 'ink';
import { useAppSelector } from '../store/hooks.js';
import type { ActiveToolCall } from '../store/slices/uiSlice.js';

const getStatusIcon = (status: ActiveToolCall['status']): string => {
  switch (status) {
    case 'starting':
      return '⏳';
    case 'running':
      return '🔄';
    case 'completed':
      return '✅';
    case 'error':
      return '❌';
    default:
      return '⚪';
  }
};

const getStatusColor = (status: ActiveToolCall['status']): string => {
  switch (status) {
    case 'starting':
      return 'yellow';
    case 'running':
      return 'blue';
    case 'completed':
      return 'green';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
};

const formatDuration = (startTime: number, endTime?: number): string => {
  const duration = (endTime || Date.now()) - startTime;
  return `${(duration / 1000).toFixed(1)}s`;
};

export const ActiveToolCalls: React.FC = () => {
  const { activeToolCalls } = useAppSelector((state) => state.ui);

  if (activeToolCalls.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Active Tool Calls:
        </Text>
      </Box>
      {activeToolCalls.map((toolCall) => (
        <Box key={toolCall.id} marginBottom={0}>
          <Box marginRight={1}>
            <Text color={getStatusColor(toolCall.status)}>
              {getStatusIcon(toolCall.status)}
            </Text>
          </Box>
          <Box flexGrow={1}>
            <Text color={getStatusColor(toolCall.status)}>
              {toolCall.displayText}
              {toolCall.status === 'completed' || toolCall.status === 'error' ? (
                <Text color="gray">
                  {' '}({formatDuration(toolCall.startTime, toolCall.endTime)})
                </Text>
              ) : (
                <Text color="gray">
                  {' '}({formatDuration(toolCall.startTime)})
                </Text>
              )}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};