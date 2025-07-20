import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Message } from '../../components/MessageList.js';

export type Mode = 'CHAT' | 'AGENT';

export interface ChatState {
  messages: Message[];
  mode: Mode;
  isLoading: boolean;
  input: string;
}

const initialState: ChatState = {
  messages: [],
  mode: 'CHAT',
  isLoading: false,
  input: '',
};

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<{
      role: 'user' | 'assistant' | 'tool';
      content: string;
      toolName?: string;
      toolArgs?: any;
      isStreaming?: boolean;
      isComplete?: boolean;
    }>) => {
      const message: Message = {
        ...action.payload,
        timestamp: Date.now(),
        isComplete: action.payload.isComplete !== undefined ? action.payload.isComplete : !action.payload.isStreaming,
      };
      state.messages.push(message);
    },

    updateLastMessage: (state, action: PayloadAction<{
      content: string;
      isComplete?: boolean;
    }>) => {
      if (state.messages.length > 0) {
        const lastMessage = state.messages[state.messages.length - 1];
        lastMessage.content = action.payload.content;
        const isComplete = action.payload.isComplete ?? false;
        lastMessage.isComplete = isComplete;
        if (isComplete) {
          lastMessage.isStreaming = false;
        }
      }
    },

    setMessages: (state, action: PayloadAction<Message[]>) => {
      state.messages = action.payload;
    },

    toggleMode: (state) => {
      state.mode = state.mode === 'CHAT' ? 'AGENT' : 'CHAT';
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setInput: (state, action: PayloadAction<string>) => {
      state.input = action.payload;
    },

    clearInput: (state) => {
      state.input = '';
    },

    appendToInput: (state, action: PayloadAction<string>) => {
      state.input += action.payload;
    },

    removeLastInputChar: (state) => {
      state.input = state.input.slice(0, -1);
    },

    // Streaming-specific reducers
    appendTokenToLastMessage: (state, action: PayloadAction<string>) => {
      if (state.messages.length > 0) {
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage.role === 'assistant') {
          lastMessage.content += action.payload;
        }
      }
    },

    markLastMessageComplete: (state) => {
      if (state.messages.length > 0) {
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage.role === 'assistant') {
          lastMessage.isComplete = true;
          lastMessage.isStreaming = false;
        }
      }
    },

    addToolCallMessage: (state, action: PayloadAction<{
      toolName: string;
      args: any;
    }>) => {
      const { toolName, args } = action.payload;
      
      // Complete the current assistant message first
      if (state.messages.length > 0) {
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage.role === 'assistant') {
          lastMessage.isComplete = true;
        }
      }

      // Create appropriate tool message based on tool type
      let content: string;
      if (toolName === 'web_search') {
        content = `🔍 Searching: "${args.query}"`;
      } else if (toolName === 'scrape_url') {
        content = `🔧 Scraping: "${args.url}"`;
      } else if (toolName === 'file_writer') {
        content = `💾 Writing: "${args.filename}"`;
      } else {
        content = `🔧 ${toolName}: ${JSON.stringify(args)}`;
      }

      const toolMessage: Message = {
        role: 'tool',
        content,
        toolName,
        toolArgs: args,
        timestamp: Date.now(),
        isComplete: true,
      };
      
      state.messages.push(toolMessage);
    },

    addStreamingAssistantMessage: (state) => {
      const message: Message = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        isComplete: false,
      };
      state.messages.push(message);
    },
  },
});

export const {
  addMessage,
  updateLastMessage,
  setMessages,
  toggleMode,
  setLoading,
  setInput,
  clearInput,
  appendToInput,
  removeLastInputChar,
  appendTokenToLastMessage,
  markLastMessageComplete,
  addToolCallMessage,
  addStreamingAssistantMessage,
} = chatSlice.actions;