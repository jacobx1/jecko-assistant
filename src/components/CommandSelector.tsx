import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { searchCommands, type CommandMatch } from '../commands/registry.js';

interface CommandSelectorProps {
  query: string;
  selectedIndex: number;
}

export const CommandSelector: React.FC<CommandSelectorProps> = ({
  query,
  selectedIndex,
}) => {
  const [matches, setMatches] = useState<CommandMatch[]>([]);

  useEffect(() => {
    const newMatches = searchCommands(query);
    setMatches(newMatches);
  }, [query]);

  if (matches.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box>
          <Text color="yellow">/ </Text>
          <Text>{query.slice(1)}</Text>
          <Text color="gray">█</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">No matching commands found</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Esc: Cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="yellow">/ </Text>
        <Text>{query.slice(1)}</Text>
        <Text color="gray">█</Text>
      </Box>
      
      <Box flexDirection="column">
        {matches.map((match, index) => {
          const isSelected = index === selectedIndex && selectedIndex < matches.length;
          return (
            <Box key={match.command.name} paddingX={1}>
              <Text color={isSelected ? 'green' : 'white'}>
                {isSelected ? '> ' : '  '}
                /{match.command.name}
              </Text>
              <Text color="gray"> - {match.command.description}</Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          ↑↓ Navigate • Enter: Select • Esc: Cancel
        </Text>
      </Box>
    </Box>
  );
};