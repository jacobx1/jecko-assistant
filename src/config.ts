import { cosmiconfig } from 'cosmiconfig';
import { homedir } from 'os';
import { join } from 'path';
import { ConfigSchema, type Config } from './schemas/config.js';

const CONFIG_NAME = '.jecko.config.json';

export async function loadConfig(): Promise<Config> {
  const explorer = cosmiconfig('jecko', {
    searchPlaces: [
      CONFIG_NAME,
      join(process.cwd(), CONFIG_NAME),
      join(homedir(), CONFIG_NAME),
    ],
    loaders: {
      '.json': (filepath, content) => {
        try {
          return JSON.parse(content);
        } catch (error) {
          throw new Error(`Invalid JSON in config file: ${filepath}`);
        }
      },
    },
  });

  try {
    const result = await explorer.search();

    if (!result || !result.config) {
      throw new Error(
        `Config file not found. Please create ${CONFIG_NAME} in your current directory or home directory.`
      );
    }

    const validatedConfig = ConfigSchema.parse(result.config);
    console.log(`✓ Config loaded from: ${result.filepath}`);

    return validatedConfig;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Config validation failed: ${error.message}`);
    }
    throw error;
  }
}

export function getConfigPath(): string[] {
  return [join(process.cwd(), CONFIG_NAME), join(homedir(), CONFIG_NAME)];
}

export function createSampleConfig(): string {
  return JSON.stringify(
    {
      openai: {
        apiKey: 'sk-your-openai-api-key-here',
        model: 'gpt-4',
      },
      serper: {
        apiKey: 'your-serper-api-key-here',
      },
      maxTokens: 4000,
      temperature: 0.7,
      mcpServers: {
        // Example MCP server configurations (uncomment to use)
        // "sequential-thinking": {
        //   "command": "npx",
        //   "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
        // },
        // "github": {
        //   "command": "npx",
        //   "args": ["-y", "@modelcontextprotocol/server-github"],
        //   "env": {
        //     "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
        //   }
        // }
      },
    },
    null,
    2
  );
}
