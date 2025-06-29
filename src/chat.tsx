import React, { useState, useEffect, useCallback, JSX } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { Config } from './schemas/config.js';
import { OpenAIClient } from './openai.js';
import { ChatMode, AgentMode } from './modes/index.js';
import { CommandSelector } from './components/CommandSelector.js';
import { StreamingText } from './components/StreamingText.js';
import { getCommand, searchCommands } from './commands/registry.js';

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

interface ChatAppProps {
  config: Config;
}

export const ChatApp: React.FC<ChatAppProps> = ({ config: initialConfig }) => {
  const [mode, setMode] = useState<Mode>('CHAT');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState(initialConfig);
  const [openaiClient, setOpenaiClient] = useState(() => new OpenAIClient(initialConfig));
  const [showCommandSelector, setShowCommandSelector] = useState(false);
  const [commandQuery, setCommandQuery] = useState('/');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [activeCommand, setActiveCommand] = useState<JSX.Element | null>(null);
  const { isRawModeSupported } = useStdin();

  const addMessage = useCallback((role: 'user' | 'assistant' | 'tool', content: string, toolName?: string, toolArgs?: any, isStreaming?: boolean) => {
    setMessages(prev => [...prev, { role, content, timestamp: new Date(), toolName, toolArgs, isStreaming, isComplete: !isStreaming }]);
  }, []);

  const updateLastMessage = useCallback((content: string, isComplete: boolean = false) => {
    setMessages(prev => {
      const newMessages = [...prev];
      if (newMessages.length > 0) {
        const lastMessage = newMessages[newMessages.length - 1];
        newMessages[newMessages.length - 1] = {
          ...lastMessage,
          content,
          isComplete,
          isStreaming: !isComplete
        };
      }
      return newMessages;
    });
  }, []);

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
          setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages.length > 0) {
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage.role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  content: lastMessage.content + token,
                  isStreaming: true,
                  isComplete: false
                };
              }
            }
            return newMessages;
          });
        },
        onComplete: () => {
          setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages.length > 0) {
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage.role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  isStreaming: false,
                  isComplete: true
                };
              }
            }
            return newMessages;
          });
        }
      };

      const response = mode === 'CHAT' 
        ? await ChatMode.execute(openaiClient, messages, userMessage, streamingCallbacks)
        : await AgentMode.execute(openaiClient, messages, userMessage, streamingCallbacks);
      
      // Add tool call indicators if any
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          addMessage('tool', `🔍 Searching: "${toolCall.args.query}"`, toolCall.name, toolCall.args);
        }
      }
    } catch (error) {
      addMessage('assistant', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, mode, openaiClient, messages, addMessage, updateLastMessage, showCommandSelector]);

  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'CHAT' ? 'AGENT' : 'CHAT');
  }, []);

  const handleCommandSelect = useCallback(async (commandName: string) => {
    const command = getCommand(commandName);
    if (command) {
      setShowCommandSelector(false);
      setInput('');
      setCommandQuery('/');
      
      const result = await command.execute(config, (newConfig) => {
        setConfig(newConfig);
        setOpenaiClient(new OpenAIClient(newConfig));
        setActiveCommand(null); // Close command after saving
      });
      
      if (result) {
        setActiveCommand(result);
      }
    }
  }, [config]);

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
          const currentIndex = Math.min(currentMatches.length - 1, selectedCommandIndex + 1);
          setSelectedCommandIndex(currentIndex);
        }
      } else if (key.return) {
        // Select current command
        const currentMatches = searchCommands(commandQuery);
        if (currentMatches.length > 0 && selectedCommandIndex < currentMatches.length) {
          handleCommandSelect(currentMatches[selectedCommandIndex].command.name);
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
      setInput(prev => prev.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      // Check if we just typed a slash to trigger command selector
      if (input === '/') {
        setShowCommandSelector(true);
        setCommandQuery('/');
        setSelectedCommandIndex(0);
        setInput(''); // Clear main input since CommandSelector will handle it
      } else {
        setInput(prev => prev + input);
      }
    }
  });

  // If there's an active command, render it
  if (activeCommand) {
    return activeCommand;
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Jecko Assistant</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {messages.length === 0 && !showCommandSelector && (
          <Box flexDirection="column">
            <Text color="gray">Welcome! Type a message and press Enter to start.</Text>
            <Text color="gray">Type / to see available commands.</Text>
          </Box>
        )}
        {messages.map((msg, idx) => (
          <Box key={idx} marginBottom={1}>
            <Text bold color={
              msg.role === 'user' ? 'green' : 
              msg.role === 'tool' ? 'yellow' :
              'blue'
            }>
              {msg.role === 'user' ? '> ' : 
               msg.role === 'tool' ? '🔧 ' :
               'Assistant: '}
            </Text>
            <Box>
              {msg.role === 'assistant' && msg.isStreaming ? (
                <StreamingText 
                  text={msg.content} 
                />
              ) : (
                msg.role === 'assistant' ? (
                  <StreamingText text={msg.content} />
                ) : (
                  <Text color={msg.role === 'tool' ? 'yellow' : 'white'}>
                    {msg.content}
                  </Text>
                )
              )}
            </Box>
          </Box>
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
        <Text color="gray">
          {showCommandSelector ? 'Command Mode' : 'Shift+Tab to switch • / for commands'}
        </Text>
      </Box>
    </Box>
  );
};