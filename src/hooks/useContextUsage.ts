import { useMemo } from 'react';

interface ContextUsageInfo {
  used: number;
  total: number;
  usedPercentage: number;
  remainingPercentage: number;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Get model context window size
const getContextWindowSize = (model: string): number => {
  const contextWindows: Record<string, number> = {
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-4-turbo': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16385,
    'o1-preview': 128000,
    'o1-mini': 128000,
    'gpt-4.1': 1000000,         // 1M tokens
    'gpt-4.1-mini': 1000000,   // 1M tokens
    'gpt-4.1-nano': 1000000,   // 1M tokens
  };
  return contextWindows[model] || 8192; // Default fallback
};

export const useContextUsage = (
  currentUsage: TokenUsage | null,
  model: string
): ContextUsageInfo | null => {
  return useMemo(() => {
    if (!currentUsage) return null;
    const contextWindow = getContextWindowSize(model);
    const usedPercentage = Math.round((currentUsage.totalTokens / contextWindow) * 100);
    const remainingPercentage = Math.max(0, 100 - usedPercentage);
    return {
      used: currentUsage.totalTokens,
      total: contextWindow,
      usedPercentage,
      remainingPercentage,
    };
  }, [currentUsage, model]);
};