import React from 'react';
import { Box, Text } from 'ink';

export type Mode = 'CHAT' | 'AGENT';

interface ContextUsageInfo {
  used: number;
  total: number;
  usedPercentage: number;
  remainingPercentage: number;
}

interface StatusBarProps {
  mode: Mode;
  contextUsageInfo: ContextUsageInfo | null;
  showCommandSelector: boolean;
  showInformationalHeader: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  contextUsageInfo,
  showCommandSelector,
  showInformationalHeader,
}) => {
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text color="cyan">Mode: {mode}</Text>
      <Box>
        {contextUsageInfo ? (
          <Text color={contextUsageInfo.usedPercentage > 80 ? 'red' : 
                       contextUsageInfo.usedPercentage > 60 ? 'yellow' : 'green'}>
            {contextUsageInfo.remainingPercentage}% context remaining
          </Text>
        ) : (
          <Text color="gray">
            {showCommandSelector
              ? 'Command Mode'
              : 'Shift+Tab to switch • / for commands'}
          </Text>
        )}
      </Box>
    </Box>
  );
};