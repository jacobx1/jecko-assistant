# Jecko Assistant

A powerful terminal-based AI chat CLI built with React/Ink, OpenAI integration, and extensible tool support. Jecko Assistant provides an interactive chat interface with autonomous agent capabilities and web search integration.

## Features

- 🎯 **Interactive Terminal UI** - Beautiful React/Ink-based interface with real-time streaming
- 🤖 **Dual Mode Operation** - Chat mode for single interactions, Agent mode for autonomous multi-turn conversations
- 🔍 **Web Search Integration** - Real-time web search via Serper API
- 🌐 **URL Scraping** - Extract content from specific URLs for detailed analysis
- 💾 **File Management** - Write content to local files with collision handling
- 📋 **Todoist Integration** - Manage tasks and projects directly from the CLI
- 🔧 **MCP Protocol Support** - Both server and client modes for Model Context Protocol
- ⚡ **Streaming Responses** - Token-by-token streaming with real-time UI updates
- 🎨 **Slash Commands** - Interactive command system with fuzzy search
- 📊 **Usage Tracking** - Monitor token usage and context consumption

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Install from Source

```bash
git clone https://github.com/your-username/jecko-assistant.git
cd jecko-assistant
npm install
npm run build
npm link  # Optional: for global CLI access
```

## Configuration

Jecko Assistant uses a configuration file to store API keys and settings. The config file is automatically searched for in:

1. Current working directory (`.jecko.config.json`)
2. Home directory (`~/.jecko.config.json`)

### Configuration Format

```json
{
  "openai": {
    "apiKey": "your-openai-api-key",
    "model": "gpt-4",
    "baseURL": "https://api.openai.com/v1"
  },
  "serper": {
    "apiKey": "your-serper-api-key"
  },
  "todoist": {
    "apiKey": "your-todoist-api-key"
  },
  "maxTokens": 4000,
  "temperature": 0.7,
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": {
        "API_KEY": "value"
      }
    }
  }
}
```

### Interactive Configuration

Run the interactive configuration setup:

```bash
jecko /config
```

## Usage

### Basic Commands

```bash
# Start interactive chat
jecko

# Start with specific mode
jecko chat    # Single-turn conversations
jecko agent   # Multi-turn autonomous mode

# Start MCP server
jecko mcp     # Expose tools via Model Context Protocol

# Development mode
npm run dev           # Start development server
npm run dev chat      # Launch chat interface
npm run dev mcp       # Start MCP server in dev mode
```

### Chat Interface

Once started, you can:

- Type messages to interact with the AI
- Use `/` to access slash commands
- Press `Ctrl+C` to exit
- Use arrow keys to navigate command suggestions

### Available Tools

- **🔍 Web Search** - Search the web for current information
- **🔧 URL Scraper** - Extract content from specific URLs
- **💾 File Writer** - Write content to local files
- **📋 Todoist** - Manage tasks and projects

### Slash Commands

- `/config` - Interactive configuration editor
- `/tools` - Display available tools and descriptions
- `/exit` - Exit the application
- `/compact` - Compact conversation history
- `/debug` - Toggle debug information

## Architecture

### Core Components

```
CLI Entry (Commander.js) → React/Ink UI → Business Logic (Modes) → OpenAI Client + Tools
```

### Technology Stack

- **TypeScript + ESM** - Modern JavaScript with full type safety
- **React + Ink** - Terminal UI rendering
- **OpenAI API** - AI chat with streaming and function calling
- **Serper API** - Web search integration
- **Zod** - Runtime schema validation
- **Redux Toolkit** - State management
- **Commander.js** - CLI argument parsing

### Mode System

**Chat Mode** (`src/modes/chat.ts`):
- Single-turn conversations
- Direct OpenAI interaction

**Agent Mode** (`src/modes/agent.ts`):
- Multi-turn autonomous conversations
- Tool usage and iteration (max 5 iterations)
- Continues until no more tool calls needed

### Tool System

Tools are built using a function-based infrastructure with embedded schemas:

```typescript
export const MyTool = createTool({
  name: 'my_tool',
  description: 'What this tool does',
  schema: z.object({
    param: z.string().describe('Parameter description'),
  }),
  execute: async ({ param }, config) => {
    // Tool implementation
    return 'Result string';
  },
});
```

## Development

### Scripts

```bash
npm run dev          # Run with tsx (development)
npm run build        # Compile TypeScript
npm run start        # Run compiled JavaScript
npm run type-check   # Validate TypeScript
npm run format       # Format code with Prettier
```

### Project Structure

```
src/
├── index.ts              # CLI entry point
├── chat.tsx              # Main React/Ink interface
├── openai.ts             # OpenAI client and streaming
├── config.ts             # Configuration management
├── modes/                # Chat and Agent modes
├── tools/                # Tool implementations
├── components/           # React/Ink UI components
├── commands/             # Slash command implementations
├── store/                # Redux state management
├── utils/                # Utility functions
└── schemas/              # Zod validation schemas
```

### Adding New Tools

1. Create a new file in `src/tools/`
2. Use the `createTool()` helper function
3. Define Zod schema for parameters
4. Implement the execute function
5. Register in `chat.tsx`

### MCP Integration

**Server Mode**: Expose tools to MCP clients
```bash
jecko mcp
```

**Client Mode**: Connect to MCP servers via configuration
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["path/to/server.js"]
    }
  }
}
```

## API Keys

You'll need API keys for:

- **OpenAI**: Get from [OpenAI Platform](https://platform.openai.com/api-keys)
- **Serper**: Get from [Serper.dev](https://serper.dev/) for web search
- **Todoist** (optional): Get from [Todoist App Console](https://developer.todoist.com/appconsole.html)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use ESM imports with `.js` extensions
- Validate all inputs with Zod schemas
- Maintain proper error handling
- Write descriptive commit messages

## License

MIT License - see LICENSE file for details.

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/your-username/jecko-assistant/issues) page.