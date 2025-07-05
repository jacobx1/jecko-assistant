import React from 'react';
import { Box, Text } from 'ink';
import { SlashCommand } from './types.js';
import { Config } from '../schemas/config.js';
import { WebSearchTool } from '../tools/serper.js';
import { URLScraperTool } from '../tools/scraper.js';
import { FilerWriterTool } from '../tools/fileWriter.js';
import { OpenAIClient } from '../openai.js';

interface ToolsDisplayProps {
  tools: { name: string; description: string; source: 'built-in' | 'mcp' }[];
}

const ToolsDisplay: React.FC<ToolsDisplayProps> = ({ tools }) => {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🔧 Available Tools
        </Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text color="gray">
          The assistant has access to {tools.length} tools:
        </Text>
      </Box>

      {tools.map((tool, index) => (
        <Box key={tool.name} marginBottom={1}>
          <Box width={4}>
            <Text color="yellow">{index + 1}.</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Box>
              <Text bold color="green">{tool.name}</Text>
              <Text color="dim"> ({tool.source})</Text>
            </Box>
            <Box paddingLeft={2}>
              <Text color="gray">{tool.description}</Text>
            </Box>
          </Box>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text color="gray">
          These tools are automatically available during agent mode conversations.
        </Text>
      </Box>
    </Box>
  );
};

export const toolsCommand: SlashCommand = {
  name: 'tools',
  description: 'List available tools and their descriptions',
  execute: async (config: Config) => {
    // Create a temporary OpenAI client to get all tools (including MCP)
    const tempClient = await OpenAIClient.create(config, [WebSearchTool, URLScraperTool, FilerWriterTool]);
    
    const allTools = tempClient.getAllTools();
    
    // Clean up the temporary client
    await tempClient.disconnect();
    
    return <ToolsDisplay tools={allTools} />;
  },
};