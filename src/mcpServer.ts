import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { WebSearchTool } from './tools/serper.js';
import { URLScraperTool } from './tools/scraper.js';
import { FilerWriterTool } from './tools/fileWriter.js';
import { toolToMCPDefinition, type Tool } from './utils/toolInfra.js';

export class JeckoMCPServer {
  private server: McpServer;
  private config: any;
  private tools: Tool<any, any>[];

  constructor() {
    this.server = new McpServer({
      name: 'jecko-assistant',
      version: '1.0.0',
    });
    
    // Initialize with our existing tools
    this.tools = [WebSearchTool, URLScraperTool, FilerWriterTool];
  }

  async initialize() {
    try {
      this.config = await loadConfig();
      this.registerTools();
      console.error('Jecko MCP Server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MCP server:', error);
      throw error;
    }
  }

  private registerTools() {
    // Automatically register all tools from our tool definitions
    for (const tool of this.tools) {
      const mcpDefinition = toolToMCPDefinition(tool);
      
      this.server.registerTool(
        mcpDefinition.name,
        {
          title: tool.name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          description: mcpDefinition.description,
          inputSchema: mcpDefinition.inputSchema,
        },
        async (params: any) => {
          try {
            const result = await tool.execute(params, this.config);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: result,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
              ],
            };
          }
        }
      );
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jecko MCP Server started on stdio');
  }
}

// CLI entry point for MCP mode
export async function startMCPServer() {
  const server = new JeckoMCPServer();
  await server.initialize();
  await server.start();
}