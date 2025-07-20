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
  mode: 'AGENT',
  isLoading: false,
  input: '',
};

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<{
      role: 'user' | 'assistant' | 'tool' | 'system';
      content: string;
      toolName?: string;
      toolArgs?: any;
      isStreaming?: boolean;
      isComplete?: boolean;
      tool_call_id?: string;
      tool_calls?: any[];
      isInternal?: boolean;
      displayContent?: string;
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
      displayMessage: string;
    }>) => {
      const { toolName, args, displayMessage } = action.payload;
      
      // Complete the current assistant message first
      if (state.messages.length > 0) {
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage.role === 'assistant') {
          lastMessage.isComplete = true;
        }
      }

      const toolMessage: Message = {
        role: 'tool',
        content: `Tool executed: ${toolName}`, // Generic content for LLM
        displayContent: displayMessage, // User-friendly display
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

    updateLastMessageWithToolCalls: (state, action: PayloadAction<any[]>) => {
      if (state.messages.length > 0) {
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage.role === 'assistant') {
          lastMessage.tool_calls = action.payload;
        }
      }
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
  updateLastMessageWithToolCalls,
} = chatSlice.actions;