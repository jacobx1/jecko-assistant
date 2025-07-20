import { configureStore } from '@reduxjs/toolkit';
import { chatSlice } from './slices/chatSlice.js';
import { uiSlice } from './slices/uiSlice.js';
import { usageSlice } from './slices/usageSlice.js';

export const store = configureStore({
  reducer: {
    chat: chatSlice.reducer,
    ui: uiSlice.reducer,
    usage: usageSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware(),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;