import React, { useState, useEffect, useCallback, JSX, useMemo } from 'react';
import { Box, Text, useInput, useStdin, Static } from 'ink';
import { Config } from './schemas/config.js';
import { OpenAIClient } from './openai.js';
import { ChatMode, AgentMode } from './modes/index.js';
import { CommandSelector } from './components/CommandSelector.js';
import { StreamingText } from './components/StreamingText.js';
import { getCommand, searchCommands } from './commands/registry.js';
import { WebSearchTool } from './tools/serper.js';
import { URLScraperTool } from './tools/scraper.js';
import { FilerWriterTool } from './tools/fileWriter.js';
import { ConversationCompactor } from './utils/compaction.js';
import { CompactDisplay } from './commands/compact.js';

export type Mode = 'CHAT' | 'AGENT';

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  toolName?: string;
  toolArgs?: any;
  isStreaming?: boolean;
  isComplete?: boolean;
}

// Memoized message component to prevent unnecessary re-renders
const MessageItem = React.memo<{ message: Message; index: number }>(({ message }) => (
  <Box marginBottom={1}>
    <Text
      bold
      color={
        message.role === 'user'
          ? 'green'
          : message.role === 'tool'
            ? 'yellow'
            : 'blue'
      }
    >
      {message.role === 'user'
        ? '> '
        : message.role === 'tool'
          ? '🔧 '
          : 'Assistant: '}
    </Text>
    <Box>
      {message.role === 'assistant' && message.isStreaming ? (
        <StreamingText text={message.content} />
      ) : message.role === 'assistant' ? (
        <StreamingText text={message.content} />
      ) : (
        <Text color={message.role === 'tool' ? 'yellow' : 'white'}>
          {message.content}
        </Text>
      )}
    </Box>
  </Box>
));

interface ChatAppProps {
  config: Config;
  onClientCreate?: (disconnectFn: () => Promise<void>) => void;
}

export const ChatApp: React.FC<ChatAppProps> = ({ config: initialConfig, onClientCreate }) => {
  const [mode, setMode] = useState<Mode>('CHAT');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState(initialConfig);
  const [openaiClient, setOpenaiClient] = useState(
    () => new OpenAIClient(initialConfig, [WebSearchTool, URLScraperTool, FilerWriterTool])
  );
  const [showCommandSelector, setShowCommandSelector] = useState(false);
  const [commandQuery, setCommandQuery] = useState('/');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [activeCommand, setActiveCommand] = useState<JSX.Element | null>(null);
  const [currentUsage, setCurrentUsage] = useState<{ promptTokens: number; completionTokens: number; totalTokens: number } | null>(null);
  const [compactor] = useState(() => new ConversationCompactor(openaiClient));
  const { isRawModeSupported } = useStdin();

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

  // Calculate context usage percentage - memoized to prevent re-calculations
  const contextUsageInfo = useMemo(() => {
    if (!currentUsage) return null;
    const contextWindow = getContextWindowSize(config.openai.model);
    const usedPercentage = Math.round((currentUsage.totalTokens / contextWindow) * 100);
    const remainingPercentage = Math.max(0, 100 - usedPercentage);
    return {
      used: currentUsage.totalTokens,
      total: contextWindow,
      usedPercentage,
      remainingPercentage,
    };
  }, [currentUsage, config.openai.model]);

  // Manual compaction function
  const performCompaction = async (): Promise<void> => {
    if (messages.length === 0) return;
    
    setIsLoading(true);
    try {
      const result = await compactor.compact(messages);
      setMessages(result.compactedMessages);
      
      // Show compaction result
      setActiveCommand(<CompactDisplay result={result} />);
      
      // Clear usage to force recalculation on next response
      setCurrentUsage(null);
    } catch (error) {
      console.error('Compaction failed:', error);
      addMessage('assistant', '❌ Compaction failed. Please try again.', undefined, undefined, false, true);
    } finally {
      setIsLoading(false);
    }
  };


  // Register client cleanup function with parent
  useEffect(() => {
    if (onClientCreate) {
      onClientCreate(() => openaiClient.disconnect());
    }
    
    // Cleanup MCP connections on unmount
    return () => {
      openaiClient.disconnect().catch(console.error);
    };
  }, [openaiClient, onClientCreate]);

  const addMessage = useCallback(
    (
      role: 'user' | 'assistant' | 'tool',
      content: string,
      toolName?: string,
      toolArgs?: any,
      isStreaming?: boolean,
      isComplete?: boolean
    ) => {
      setMessages((prev) => [
        ...prev,
        {
          role,
          content,
          timestamp: new Date(),
          toolName,
          toolArgs,
          isStreaming,
          isComplete: isComplete !== undefined ? isComplete : !isStreaming,
        },
      ]);
    },
    []
  );

  // Update the auto-compaction function now that addMessage is defined
  const checkAutoCompactionActual = useCallback(async (): Promise<void> => {
    if (contextUsageInfo && contextUsageInfo.remainingPercentage <= 10 && messages.length > 6) {
      addMessage('assistant', '⚠️ Context space is running low (10% remaining). Auto-compacting conversation...', undefined, undefined, false, true);
      await performCompaction();
      addMessage('assistant', '✅ Auto-compaction completed. Conversation history has been summarized.', undefined, undefined, false, true);
    }
  }, [contextUsageInfo, messages.length, addMessage, performCompaction]);

  const updateLastMessage = useCallback(
    (content: string, isComplete: boolean = false) => {
      setMessages((prev) => {
        const newMessages = [...prev];
        if (newMessages.length > 0) {
          const lastMessage = newMessages[newMessages.length - 1];
          newMessages[newMessages.length - 1] = {
            ...lastMessage,
            content,
            isComplete,
            isStreaming: !isComplete,
          };
        }
        return newMessages;
      });
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading || showCommandSelector) return;

    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);
    setIsLoading(true);

    try {
      // Add streaming assistant response placeholder
      addMessage('assistant', '', undefined, undefined, true);

      // Set up streaming callbacks
      const streamingCallbacks = {
        onToken: (token: string) => {
          setMessages((prev) => {
            const newMessages = [...prev];
            if (newMessages.length > 0) {
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage.role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  content: lastMessage.content + token,
                  isStreaming: true,
                  isComplete: false,
                };
              }
            }
            return newMessages;
          });
        },
        onComplete: () => {
          setMessages((prev) => {
            const newMessages = [...prev];
            if (newMessages.length > 0) {
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage.role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  isStreaming: false,
                  isComplete: true,
                };
              }
            }
            return newMessages;
          });
        },
        onToolCall: (toolName: string, args: any) => {
          // Complete the current assistant message first
          setMessages((prev) => {
            const newMessages = [...prev];
            if (newMessages.length > 0) {
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage.role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  isStreaming: false,
                  isComplete: true,
                };
              }
            }
            return newMessages;
          });

          // Add tool call indicator immediately when tool is executed
          if (toolName === 'web_search') {
            addMessage('tool', `🔍 Searching: "${args.query}"`, toolName, args);
          } else if (toolName === 'scrape_url') {
            addMessage('tool', `🔧 Scraping: "${args.url}"`, toolName, args);
          } else if (toolName === 'file_writer') {
            addMessage(
              'tool',
              `💾 Writing: "${args.filename}"`,
              toolName,
              args
            );
          } else {
            addMessage(
              'tool',
              `🔧 ${toolName}: ${JSON.stringify(args)}`,
              toolName,
              args
            );
          }
        },
        onNewMessage: () => {
          // Create a new streaming assistant message for the follow-up response
          addMessage('assistant', '', undefined, undefined, true);
        },
        onUsage: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => {
          setCurrentUsage(usage);
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
      addMessage(
        'assistant',
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    input,
    isLoading,
    mode,
    openaiClient,
    messages,
    addMessage,
    updateLastMessage,
    showCommandSelector,
    checkAutoCompactionActual,
  ]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'CHAT' ? 'AGENT' : 'CHAT'));
  }, []);

  const handleCommandSelect = useCallback(
    async (commandName: string) => {
      const command = getCommand(commandName);
      if (command) {
        setShowCommandSelector(false);
        setInput('');
        setCommandQuery('/');

        // Handle compact command specially
        if (commandName === 'compact') {
          await performCompaction();
          return;
        }

        const result = await command.execute(config, (newConfig) => {
          setConfig(newConfig);
          setOpenaiClient(new OpenAIClient(newConfig, [WebSearchTool, URLScraperTool, FilerWriterTool]));
          setActiveCommand(null); // Close command after saving
        });

        if (result) {
          setActiveCommand(result);
        }
      }
    },
    [config, performCompaction]
  );

  const handleCommandCancel = useCallback(() => {
    setShowCommandSelector(false);
    setInput('');
    setCommandQuery('/');
    setSelectedCommandIndex(0);
  }, []);

  const handleCommandExit = useCallback(() => {
    setActiveCommand(null);
  }, []);

  useInput((input: string, key: any) => {
    // If we're in an active command, let it handle the input
    if (activeCommand) {
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
          const currentIndex = Math.max(0, selectedCommandIndex - 1);
          setSelectedCommandIndex(currentIndex);
        }
      } else if (key.downArrow) {
        // Get current matches and move down
        const currentMatches = searchCommands(commandQuery);
        if (currentMatches.length > 0) {
          const currentIndex = Math.min(
            currentMatches.length - 1,
            selectedCommandIndex + 1
          );
          setSelectedCommandIndex(currentIndex);
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
          setCommandQuery(newQuery);
          setSelectedCommandIndex(0);
        }
      } else if (input && !key.ctrl && !key.meta) {
        const newQuery = commandQuery + input;
        setCommandQuery(newQuery);
        setSelectedCommandIndex(0);
      }
      return;
    }

    if (key.return) {
      handleSubmit();
    } else if (key.shift && key.tab) {
      toggleMode();
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      // Check if we just typed a slash to trigger command selector
      if (input === '/') {
        setShowCommandSelector(true);
        setCommandQuery('/');
        setSelectedCommandIndex(0);
        setInput(''); // Clear main input since CommandSelector will handle it
      } else {
        setInput((prev) => prev + input);
      }
    }
  });

  // If there's an active command, render it
  if (activeCommand) {
    return activeCommand;
  }

  const showInformationalHeader = messages.length === 0 && !showCommandSelector;

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
     {showInformationalHeader && (
      <Box borderStyle="single" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Jecko Assistant
        </Text>
      </Box>
     )}

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {/* Show welcome message only when there are no messages and not in command mode */}
        {showInformationalHeader && (
          <Box flexDirection="column">
            <Text color="gray">
              Welcome! Type a message and press Enter to start.
            </Text>
            <Text color="gray">Type / to see available commands.</Text>
          </Box>
        )}
        
        {/* Use Static for completed messages to prevent re-renders - only when we have messages */}
        {messages.length > 0 && (
          <Static items={messages.filter(msg => msg.isComplete !== false)}>
            {(msg, idx) => (
              <MessageItem key={`${msg.timestamp.getTime()}-${idx}`} message={msg} index={idx} />
            )}
          </Static>
        )}
        
        {/* Render streaming/incomplete messages separately */}
        {messages
          .filter(msg => msg.isComplete === false || msg.isStreaming)
          .map((msg, idx) => (
            <MessageItem key={`streaming-${msg.timestamp.getTime()}-${idx}`} message={msg} index={idx} />
          ))}
        
        {isLoading && (
          <Box>
            <Text color="yellow">Assistant is thinking...</Text>
          </Box>
        )}
      </Box>

      {/* Input or Command Selector */}
      {showCommandSelector ? (
        <Box borderStyle="single" paddingX={1}>
          <CommandSelector
            query={commandQuery}
            selectedIndex={selectedCommandIndex}
          />
        </Box>
      ) : (
        <Box borderStyle="single" paddingX={1}>
          <Text color="green">{'> '}</Text>
          <Text>{input}</Text>
          <Text color="gray">█</Text>
        </Box>
      )}

      {/* Status bar */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text color="cyan">Mode: {mode}</Text>
        <Box>
          {contextUsageInfo ? (
            <Text color={contextUsageInfo.usedPercentage > 80 ? 'red' : 
                         contextUsageInfo.usedPercentage > 60 ? 'yellow' : 'green'}>
              {contextUsageInfo.remainingPercentage}% context remaining
            </Text>
          ) : (
            <Text color="gray">
              {showCommandSelector
                ? 'Command Mode'
                : 'Shift+Tab to switch • / for commands'}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
