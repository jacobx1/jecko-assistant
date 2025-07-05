import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { type Config, type MCPServer } from './schemas/config.js';
import { createTool, type Tool } from './utils/toolInfra.js';
import { z } from 'zod';

export interface MCPClientTool {
  name: string;
  description: string;
  inputSchema: any;
  serverName: string;
  client: Client;
}

export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, MCPClientTool> = new Map();

  async initialize(config: Config): Promise<void> {
    if (!config.mcpServers) {
      return;
    }

    // Initialize all MCP server connections
    const connectionPromises = Object.entries(config.mcpServers).map(
      ([serverName, serverConfig]) => this.connectToServer(serverName, serverConfig)
    );

    await Promise.allSettled(connectionPromises);
  }

  private async connectToServer(serverName: string, serverConfig: MCPServer): Promise<void> {
    try {
      // Create stdio transport
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
      });

      // Create client
      const client = new Client({
        name: 'jecko-assistant',
        version: '1.0.0',
      }, {
        capabilities: {
          tools: {},
        },
      });

      // Connect client to transport
      await client.connect(transport);

      // Store client
      this.clients.set(serverName, client);

      // List available tools from this server
      const toolsResponse = await client.listTools();
      
      // Register tools from this server
      for (const tool of toolsResponse.tools) {
        const mcpTool: MCPClientTool = {
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema,
          serverName,
          client,
        };
        this.tools.set(`${serverName}:${tool.name}`, mcpTool);
      }

      console.error(`✓ Connected to MCP server: ${serverName} (${toolsResponse.tools.length} tools)`);
    } catch (error) {
      console.error(`✗ Failed to connect to MCP server ${serverName}:`, error);
    }
  }

  async disconnect(): Promise<void> {
    // Close all client connections
    const disconnectPromises = Array.from(this.clients.entries()).map(
      async ([serverName, client]) => {
        try {
          await client.close();
        } catch (error) {
          console.error(`Error disconnecting from ${serverName}:`, error);
        }
      }
    );

    await Promise.allSettled(disconnectPromises);
    
    this.clients.clear();
    this.tools.clear();
  }

  getAvailableTools(): MCPClientTool[] {
    return Array.from(this.tools.values());
  }

  // Convert MCP tools to our internal Tool format
  createToolWrappers(): Tool<any, any>[] {
    return Array.from(this.tools.values()).map(mcpTool => {
      // Create a Zod schema from the JSON schema
      const schema = this.jsonSchemaToZod(mcpTool.inputSchema);
      
      return createTool({
        name: mcpTool.name,
        description: mcpTool.description,
        schema,
        execute: async (params: any) => {
          try {
            const result = await mcpTool.client.callTool({
              name: mcpTool.name,
              arguments: params,
            });
            
            // Convert MCP response to string
            if (result.content && Array.isArray(result.content)) {
              return result.content
                .map(item => {
                  if (item.type === 'text') {
                    return item.text;
                  }
                  return `[${item.type}]`;
                })
                .join('\n');
            }
            
            return 'Tool executed successfully';
          } catch (error) {
            throw new Error(`MCP tool error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        },
      });
    });
  }

  private jsonSchemaToZod(jsonSchema: any): z.ZodSchema {
    // Simple JSON Schema to Zod conversion
    if (!jsonSchema || typeof jsonSchema !== 'object') {
      return z.any();
    }

    if (jsonSchema.type === 'object' && jsonSchema.properties) {
      const shape: Record<string, z.ZodSchema> = {};
      const required = jsonSchema.required || [];

      for (const [key, prop] of Object.entries(jsonSchema.properties)) {
        const propSchema = prop as any;
        let zodSchema: z.ZodSchema;

        switch (propSchema.type) {
          case 'string':
            zodSchema = z.string();
            if (propSchema.description) {
              zodSchema = zodSchema.describe(propSchema.description);
            }
            break;
          case 'number':
            zodSchema = z.number();
            if (propSchema.description) {
              zodSchema = zodSchema.describe(propSchema.description);
            }
            break;
          case 'boolean':
            zodSchema = z.boolean();
            if (propSchema.description) {
              zodSchema = zodSchema.describe(propSchema.description);
            }
            break;
          default:
            zodSchema = z.any();
        }

        if (propSchema.default !== undefined) {
          zodSchema = zodSchema.default(propSchema.default);
        }

        if (!required.includes(key)) {
          zodSchema = zodSchema.optional();
        }

        shape[key] = zodSchema;
      }

      return z.object(shape);
    }

    return z.any();
  }
}