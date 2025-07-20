import React, { useState, useEffect, useCallback } from 'react';
import { Box, useInput, useStdin } from 'ink';
import { Config } from './schemas/config.js';
import { OpenAIClient } from './openai.js';
import { ChatMode } from './modes/chat.js';
import { AgentMode } from './modes/agent.js';
import { getCommand, searchCommands } from './commands/registry.js';
import { WebSearchTool } from './tools/serper.js';
import { URLScraperTool } from './tools/scraper.js';
import { FilerWriterTool } from './tools/fileWriter.js';
import { TodoistCreateTaskTool, TodoistGetTasksTool, TodoistGetProjectsTool, TodoistCompleteTaskTool, TodoistCreateProjectTool } from './tools/todoist.js';
import { ConversationCompactor } from './utils/compaction.js';

// Import new composable components
import { MessageList, type Message } from './components/MessageList.js';
import { ChatInput, type Mode } from './components/ChatInput.js';
import { StatusBar } from './components/StatusBar.js';
import { ActiveCommand } from './components/ActiveCommand.js';
import { useContextUsage } from './hooks/useContextUsage.js';

// Redux imports
import { useAppDispatch, useAppSelector } from './store/hooks.js';
import { store } from './store/index.js';
import {
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
} from './store/slices/chatSlice.js';
import {
  setShowCommandSelector,
  setCommandQuery,
  setSelectedCommandIndex,
  setActiveCommand,
  showCommandSelector as showCommandSelectorAction,
  hideCommandSelector,
  appendToCommandQuery,
  removeLastCommandChar,
  navigateCommandUp,
  navigateCommandDown,
  setActiveCommandJSX,
} from './store/slices/uiSlice.js';
import { setCurrentUsage } from './store/slices/usageSlice.js';
import { commandManager } from './utils/commandManager.js';

interface ChatAppProps {
  config: Config;
  onClientCreate?: (disconnectFn: () => Promise<void>) => void;
}

export const ChatApp: React.FC<ChatAppProps> = ({ config: initialConfig, onClientCreate }) => {
  // Redux state
  const dispatch = useAppDispatch();
  const { messages, mode, isLoading, input } = useAppSelector((state) => state.chat);
  const { showCommandSelector, commandQuery, selectedCommandIndex, activeCommand, hasActiveCommandJSX } = useAppSelector((state) => state.ui);
  const { currentUsage } = useAppSelector((state) => state.usage);

  // Local state that doesn't need Redux
  const [config, setConfig] = useState(initialConfig);
  const [openaiClient, setOpenaiClient] = useState(
    () => new OpenAIClient(initialConfig, [WebSearchTool, URLScraperTool, FilerWriterTool, TodoistCreateTaskTool, TodoistGetTasksTool, TodoistGetProjectsTool, TodoistCompleteTaskTool, TodoistCreateProjectTool])
  );
  const [compactor] = useState(() => new ConversationCompactor(openaiClient));
  const { isRawModeSupported } = useStdin();

  // Use the custom hook for context usage calculation
  const contextUsageInfo = useContextUsage(currentUsage, config.openai.model);

  // Manual compaction function
  const performCompaction = async (): Promise<void> => {
    if (messages.length === 0) return;
    
    dispatch(setLoading(true));
    try {
      const result = await compactor.compact(messages);
      dispatch(setMessages(result.compactedMessages));
      
      // Show compaction result
      dispatch(setActiveCommand({
        type: 'compact',
        data: { compactionResult: result }
      }));
      
      // Clear usage to force recalculation on next response
      dispatch(setCurrentUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }));
    } catch (error) {
      console.error('Compaction failed:', error);
      dispatch(addMessage({
        role: 'assistant',
        content: '❌ Compaction failed. Please try again.',
        isComplete: true,
      }));
    } finally {
      dispatch(setLoading(false));
    }
  };


  // Register client cleanup function with parent and handle signals
  useEffect(() => {
    if (onClientCreate) {
      onClientCreate(() => openaiClient.disconnect());
    }
    
    // Handle Ctrl+C within the component
    const handleExit = async () => {
      try {
        await openaiClient.disconnect();
      } catch (error) {
        console.error('Error during cleanup:', error);
      } finally {
        process.exit(0);
      }
    };

    // Add Ctrl+C handler
    process.on('SIGINT', handleExit);
    
    // Cleanup MCP connections on unmount
    return () => {
      process.off('SIGINT', handleExit);
      openaiClient.disconnect().catch(console.error);
    };
  }, [openaiClient, onClientCreate]);


  // Auto-compaction function
  const checkAutoCompactionActual = useCallback(async (): Promise<void> => {
    if (contextUsageInfo && contextUsageInfo.remainingPercentage <= 10 && messages.length > 6) {
      dispatch(addMessage({
        role: 'assistant',
        content: '⚠️ Context space is running low (10% remaining). Auto-compacting conversation...',
        isComplete: true,
      }));
      await performCompaction();
      dispatch(addMessage({
        role: 'assistant',
        content: '✅ Auto-compaction completed. Conversation history has been summarized.',
        isComplete: true,
      }));
    }
  }, [contextUsageInfo, messages.length, dispatch, performCompaction]);


  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading || showCommandSelector) return;

    const userMessage = input.trim();
    dispatch(clearInput());
    dispatch(addMessage({
      role: 'user',
      content: userMessage,
      isComplete: true,
    }));
    dispatch(setLoading(true));

    try {
      // Add streaming assistant response placeholder
      dispatch(addStreamingAssistantMessage());

      // Set up simplified streaming callbacks
      const streamingCallbacks = {
        onToken: (token: string) => {
          dispatch(appendTokenToLastMessage(token));
        },
        onComplete: () => {
          dispatch(markLastMessageComplete());
        },
        onToolCall: (toolName: string, args: any) => {
          dispatch(addToolCallMessage({ toolName, args }));
        },
        onNewMessage: () => {
          dispatch(addStreamingAssistantMessage());
        },
        onUsage: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => {
          dispatch(setCurrentUsage(usage));
          // Check for auto-compaction after setting usage
          setTimeout(() => checkAutoCompactionActual(), 100);
        },
      };

      const response =
        mode === 'CHAT'
          ? await ChatMode.execute(
              openaiClient,
              messages,
              userMessage,
              streamingCallbacks
            )
          : await AgentMode.execute(
              openaiClient,
              messages,
              userMessage,
              streamingCallbacks
            );
    } catch (error) {
      dispatch(addMessage({
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isComplete: true,
      }));
    } finally {
      dispatch(setLoading(false));
    }
  }, [
    input,
    isLoading,
    mode,
    openaiClient,
    messages,
    showCommandSelector,
    checkAutoCompactionActual,
    dispatch,
  ]);

  const toggleModeCallback = useCallback(() => {
    dispatch(toggleMode());
  }, [dispatch]);

  const handleCommandSelect = useCallback(
    async (commandName: string) => {
      const command = getCommand(commandName);
      if (command) {
        dispatch(hideCommandSelector());
        dispatch(clearInput());

        // Handle compact command specially
        if (commandName === 'compact') {
          await performCompaction();
          return;
        }

        // Handle exit command specially
        if (commandName === 'exit') {
          dispatch(setActiveCommand({ type: 'exit' }));
          setTimeout(async () => {
            await openaiClient.disconnect();
            process.exit(0);
          }, 1500);
          return;
        }

        const result = await command.execute(config, (newConfig) => {
          setConfig(newConfig);
          setOpenaiClient(new OpenAIClient(newConfig, [WebSearchTool, URLScraperTool, FilerWriterTool, TodoistCreateTaskTool, TodoistGetTasksTool, TodoistGetProjectsTool, TodoistCompleteTaskTool, TodoistCreateProjectTool]));
          // Close command after saving
          dispatch(setActiveCommandJSX(false));
          commandManager.clear();
        });

        if (result) {
          // Store JSX in command manager and track in Redux
          commandManager.setCommand(result);
          dispatch(setActiveCommandJSX(true));
        }
      }
    },
    [config, performCompaction, dispatch, openaiClient]
  );

  const handleCommandCancel = useCallback(() => {
    dispatch(hideCommandSelector());
    dispatch(clearInput());
  }, [dispatch]);

  const handleCommandExit = useCallback(() => {
    dispatch(setActiveCommand({ type: null }));
    dispatch(setActiveCommandJSX(false));
    commandManager.clear();
  }, [dispatch]);

  useInput((input: string, key: any) => {
    // Enhanced Ctrl+C handling
    if (key.ctrl && input === 'c') {
      console.log('\n\nExiting...');
      openaiClient.disconnect().catch(() => {}).finally(() => {
        process.exit(0);
      });
      return;
    }

    // If we're in an active command, let it handle the input
    if (hasActiveCommandJSX || activeCommand.type) {
      if (key.escape) {
        handleCommandExit();
      }
      return;
    }

    // Handle command selector input directly here
    if (showCommandSelector) {
      if (key.upArrow) {
        // Get current matches and move up
        const currentMatches = searchCommands(commandQuery);
        if (currentMatches.length > 0) {
          dispatch(navigateCommandUp(currentMatches.length));
        }
      } else if (key.downArrow) {
        // Get current matches and move down
        const currentMatches = searchCommands(commandQuery);
        if (currentMatches.length > 0) {
          dispatch(navigateCommandDown(currentMatches.length));
        }
      } else if (key.return) {
        // Select current command
        const currentMatches = searchCommands(commandQuery);
        if (
          currentMatches.length > 0 &&
          selectedCommandIndex < currentMatches.length
        ) {
          handleCommandSelect(
            currentMatches[selectedCommandIndex].command.name
          );
        }
      } else if (key.escape) {
        handleCommandCancel();
      } else if (key.backspace || key.delete) {
        const newQuery = commandQuery.slice(0, -1);
        if (newQuery === '' || newQuery.length === 0) {
          handleCommandCancel();
        } else {
          dispatch(setCommandQuery(newQuery));
          dispatch(setSelectedCommandIndex(0));
        }
      } else if (input && !key.ctrl && !key.meta) {
        const newQuery = commandQuery + input;
        dispatch(setCommandQuery(newQuery));
        dispatch(setSelectedCommandIndex(0));
      }
      return;
    }

    if (key.return) {
      handleSubmit();
    } else if (key.shift && key.tab) {
      toggleModeCallback();
    } else if (key.backspace || key.delete) {
      dispatch(removeLastInputChar());
    } else if (input && !key.ctrl && !key.meta) {
      // Check if we just typed a slash to trigger command selector
      if (input === '/') {
        dispatch(showCommandSelectorAction());
        dispatch(clearInput()); // Clear main input since CommandSelector will handle it
      } else {
        dispatch(appendToInput(input));
      }
    }
  });

  // If there's an active command, render it
  if (hasActiveCommandJSX) {
    const commandJSX = commandManager.getCommand();
    if (commandJSX) {
      return commandJSX;
    }
  }
  
  if (activeCommand.type) {
    return <ActiveCommand activeCommand={activeCommand} />;
  }

  const showInformationalHeader = messages.length === 0 && !showCommandSelector;

  return (
    <Box flexDirection="column" height="100%">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        showInformationalHeader={showInformationalHeader}
      />

      <ChatInput
        input={input}
        mode={mode}
        showCommandSelector={showCommandSelector}
        commandQuery={commandQuery}
        selectedCommandIndex={selectedCommandIndex}
        showInformationalHeader={showInformationalHeader}
      />

      <StatusBar
        mode={mode}
        contextUsageInfo={contextUsageInfo}
        showCommandSelector={showCommandSelector}
        showInformationalHeader={showInformationalHeader}
      />
    </Box>
  );
};
