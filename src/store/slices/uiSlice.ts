import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface CompactionResult {
  tokensSaved: number;
  originalCount: number;
  compactedCount: number;
}

export interface ActiveCommandState {
  type: 'exit' | 'compact' | 'config' | 'tools' | 'generic' | null;
  data?: {
    compactionResult?: CompactionResult;
    [key: string]: any;
  };
}

export interface UIState {
  showCommandSelector: boolean;
  commandQuery: string;
  selectedCommandIndex: number;
  activeCommand: ActiveCommandState;
  hasActiveCommandJSX: boolean; // Track if external JSX command is active
}

const initialState: UIState = {
  showCommandSelector: false,
  commandQuery: '/',
  selectedCommandIndex: 0,
  activeCommand: { type: null },
  hasActiveCommandJSX: false,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setShowCommandSelector: (state, action: PayloadAction<boolean>) => {
      state.showCommandSelector = action.payload;
    },

    setCommandQuery: (state, action: PayloadAction<string>) => {
      state.commandQuery = action.payload;
    },

    setSelectedCommandIndex: (state, action: PayloadAction<number>) => {
      state.selectedCommandIndex = action.payload;
    },

    setActiveCommand: (state, action: PayloadAction<ActiveCommandState>) => {
      state.activeCommand = action.payload;
    },

    showCommandSelector: (state) => {
      state.showCommandSelector = true;
      state.commandQuery = '/';
      state.selectedCommandIndex = 0;
    },

    hideCommandSelector: (state) => {
      state.showCommandSelector = false;
      state.commandQuery = '/';
      state.selectedCommandIndex = 0;
    },

    appendToCommandQuery: (state, action: PayloadAction<string>) => {
      state.commandQuery += action.payload;
      state.selectedCommandIndex = 0;
    },

    removeLastCommandChar: (state) => {
      const newQuery = state.commandQuery.slice(0, -1);
      if (newQuery === '' || newQuery.length === 0) {
        state.showCommandSelector = false;
        state.commandQuery = '/';
        state.selectedCommandIndex = 0;
      } else {
        state.commandQuery = newQuery;
        state.selectedCommandIndex = 0;
      }
    },

    navigateCommandUp: (state, action: PayloadAction<number>) => {
      state.selectedCommandIndex = Math.max(0, state.selectedCommandIndex - 1);
    },

    navigateCommandDown: (state, action: PayloadAction<number>) => {
      const maxIndex = action.payload - 1;
      state.selectedCommandIndex = Math.min(maxIndex, state.selectedCommandIndex + 1);
    },

    setActiveCommandJSX: (state, action: PayloadAction<boolean>) => {
      state.hasActiveCommandJSX = action.payload;
      if (!action.payload) {
        state.activeCommand = { type: null };
      }
    },
  },
});

export const {
  setShowCommandSelector,
  setCommandQuery,
  setSelectedCommandIndex,
  setActiveCommand,
  showCommandSelector,
  hideCommandSelector,
  appendToCommandQuery,
  removeLastCommandChar,
  navigateCommandUp,
  navigateCommandDown,
  setActiveCommandJSX,
} = uiSlice.actions;