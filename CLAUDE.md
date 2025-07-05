# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development

- `npm run dev` - Run development server with tsx (TypeScript execution)
- `npm run dev chat` - Launch interactive chat interface
- `npm run build` - Compile TypeScript to `/dist` directory
- `npm run start` - Run compiled JavaScript from dist
- `npm run type-check` - Validate TypeScript without emitting files

### Testing Configuration

- Test configuration files in the working directory by placing `.jecko.config.json`
- Run with different modes: `/config` command for interactive configuration setup

## Architecture Overview

**Jecko Assistant** is a terminal-based AI chat CLI built with React/Ink, OpenAI integration, and web search capabilities.

### Key Components Architecture

```
CLI Entry (Commander.js) → React/Ink UI → Business Logic (Modes) → OpenAI Client + Tools
```

**Core Technologies:**

- **TypeScript + ESM** (Node16 module resolution)
- **React + Ink** for terminal UI rendering
- **OpenAI API** with streaming and function calling
- **Serper API** for web search integration
- **Zod** for schema validation

### Application Flow

1. **Entry Point**: `/src/index.ts` handles CLI commands via Commander.js
2. **UI Layer**: `/src/chat.tsx` manages the main React/Ink interface
3. **Mode System**: Chat vs Agent modes with different conversation behaviors
4. **OpenAI Integration**: `/src/openai.ts` handles streaming responses and tool calls
5. **Tool System**: Extensible tools starting with web search via Serper

### Configuration System

Uses **Cosmiconfig** to locate `.jecko.config.json` files:

- Search order: current directory → home directory
- **Zod validation** ensures type safety at runtime
- Interactive configuration via `/config` slash command

### Streaming Architecture

**Critical**: The streaming implementation handles:

- **Token-by-token streaming** from OpenAI with real-time UI updates
- **Tool call accumulation** during streaming (tool calls arrive in fragments)
- **Multi-phase responses**: Initial stream → Tool execution → Follow-up stream
- **Message lifecycle**: Separate assistant messages for pre/post tool execution

### Mode System Details

**Chat Mode** (`/src/modes/chat.ts`):

- Single-turn conversations
- Direct OpenAI interaction

**Agent Mode** (`/src/modes/agent.ts`):

- Multi-turn autonomous conversations
- Tool usage and iteration (max 5 iterations)
- Continues until no more tool calls needed

### Tool Integration

Tools use OpenAI's function calling:

- **Web Search**: Integrated via `/src/tools/serper.ts` - search the web for current information
- **URL Scraper**: Integrated via `/src/tools/scraper.ts` - scrape content from specific URLs for detailed information
- **File Writer**: Integrated via `/src/tools/fileWriter.ts` - write content to local files with collision handling
- **Tool call indicators**: Real-time UI feedback with 🔍 (search), 🔧 (scraper), and 💾 (file writer) icons
- **Streaming tool calls**: Properly accumulate fragmented tool call data before execution

**Schema-Driven Tool Definitions**:

- Tool schemas defined in `/src/schemas/tools.ts` using Zod with `.describe()` for parameter descriptions
- OpenAI function definitions auto-generated via `/src/utils/zodToOpenAI.ts`
- Eliminates duplication between validation schemas and OpenAI function definitions
- Supports all Zod types: objects, strings, numbers, booleans, arrays, enums, optional fields, and defaults

### Development Environment

**tsx Configuration**: Uses `tsx.config.json` with ESM output for development
**Module Resolution**: Node16 with proper ESM imports (`.js` extensions required)
**Markdown Rendering**: Uses `marked` + `marked-terminal` (replaced `ink-markdown` due to ESM compatibility)

### Slash Command System

Interactive command registry with:

- **Real-time fuzzy search** as user types
- **Keyboard navigation** (up/down arrows, enter to select)
- **Extensible**: Add commands to `/src/commands/` and register in registry

### Key Implementation Notes

**Streaming Callbacks**:

- `onToken` - Real-time token updates
- `onToolCall` - Immediate tool execution indicators
- `onNewMessage` - Creates fresh assistant message for tool follow-ups
- `onComplete` - Marks message completion

**Configuration Schema** (`/src/schemas/config.ts`):

```typescript
{
  openai: { apiKey, model, baseURL? }
  serper: { apiKey }  // Used for both web search and URL scraping
  maxTokens, temperature
}
```

**Message Flow for Tool Calls**:

1. Initial assistant message (streaming)
2. Tool call detected → Complete first message
3. Tool indicator message
4. New assistant message for follow-up (streaming)
5. Final completion

### Binary Distribution

**Smart Launcher** (`/bin/jecko`): Automatically detects development vs production and uses appropriate execution method (tsx vs node).
