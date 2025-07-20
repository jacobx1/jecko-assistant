import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageState {
  currentUsage: TokenUsage | null;
}

const initialState: UsageState = {
  currentUsage: null,
};

export const usageSlice = createSlice({
  name: 'usage',
  initialState,
  reducers: {
    setCurrentUsage: (state, action: PayloadAction<TokenUsage>) => {
      state.currentUsage = action.payload;
    },

    clearUsage: (state) => {
      state.currentUsage = null;
    },

    addUsage: (state, action: PayloadAction<TokenUsage>) => {
      if (state.currentUsage) {
        state.currentUsage.promptTokens += action.payload.promptTokens;
        state.currentUsage.completionTokens += action.payload.completionTokens;
        state.currentUsage.totalTokens += action.payload.totalTokens;
      } else {
        state.currentUsage = action.payload;
      }
    },
  },
});

export const {
  setCurrentUsage,
  clearUsage,
  addUsage,
} = usageSlice.actions;