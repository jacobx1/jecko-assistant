import {
  OpenAIClient,
  Message,
  ChatResponse,
  StreamingCallbacks,
} from '../openai.js';

export class AgentMode {
  static async execute(
    client: OpenAIClient,
    previousMessages: Array<{
      role: 'user' | 'assistant' | 'tool' | 'system';
      content: string;
      tool_call_id?: string;
      tool_calls?: any[];
      isInternal?: boolean;
      displayContent?: string;
    }>,
    userInput: string,
    streamingCallbacks?: StreamingCallbacks
  ): Promise<ChatResponse> {
    const messages: Message[] = [
      ...previousMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
        content: msg.content, // Always use content for LLM, not displayContent
        tool_call_id: msg.tool_call_id,
        tool_calls: msg.tool_calls,
        isInternal: msg.isInternal,
        displayContent: msg.displayContent,
      })),
      {
        role: 'user',
        content: userInput,
      },
    ];

    const responses: string[] = [];
    const allToolCalls: any[] = [];
    let currentMessages = [...messages];
    let iteration = 0;
    const maxIterations = 25; // Prevent infinite loops

    while (iteration < maxIterations) {
      iteration++;
      
      const result = await client.chat(
        currentMessages,
        true,
        streamingCallbacks,
        true // isAgentMode = true
      );

      responses.push(result.content);

      // If this is the first iteration and there are no tool calls, behave like chat mode
      if (iteration === 1 && (!result.messagesToAdd || result.messagesToAdd.length === 0)) {
        // No tools were called on the initial response, exit agent mode
        break;
      }

      // Handle tool calls and messages to add
      if (result.messagesToAdd && result.messagesToAdd.length > 0) {
        // Add tool call and response messages to conversation
        currentMessages.push(...result.messagesToAdd);

        if (result.toolCalls) {
          allToolCalls.push(...result.toolCalls);

          // Check if the agent called the agent_done tool
          const doneTool = result.toolCalls.find(
            (tc) => tc.name === 'agent_done'
          );
          if (doneTool) {
            // Agent has signaled completion - end the loop
            break;
          }
        }

        // Signal that we need a new assistant message for follow-up
        streamingCallbacks?.onNewMessage?.();

        // Add a continuation prompt to keep the agent going
        const remainingIterations = maxIterations - iteration;
        const isLastIteration = remainingIterations === 0;
        const isNearEnd = remainingIterations <= 1;

        let continuationPrompt: string;
        if (isLastIteration) {
          continuationPrompt =
            'FINAL TURN: You must now complete your task and call agent_done with a summary. No more tool calls will be possible after this response.';
        } else if (isNearEnd) {
          continuationPrompt = `You have only ${remainingIterations} turn remaining. Please wrap up your task soon and call agent_done when complete. Continue with any final analysis or actions needed.`;
        } else {
          continuationPrompt = `You have ${remainingIterations} turns remaining. Please continue with any additional analysis or actions needed based on the information gathered.`;
        }

        currentMessages.push({
          role: 'user',
          content: continuationPrompt,
          isInternal: true,
        });
      } else {
        // No tool calls - add the response and continue (allow analysis)
        currentMessages.push({
          role: 'assistant',
          content: result.content,
        });

        const remainingIterations = maxIterations - iteration;
        const isLastIteration = remainingIterations === 0;
        const isNearEnd = remainingIterations <= 1;

        let continuationPrompt: string;
        if (isLastIteration) {
          continuationPrompt =
            'FINAL TURN: You must now complete your task and call agent_done with a summary if your work is done. No more iterations will be possible after this response.';
        } else if (isNearEnd) {
          continuationPrompt = `You have only ${remainingIterations} turn remaining. If your analysis is complete, please call agent_done. Otherwise, continue with your final analysis or action.`;
        } else {
          continuationPrompt = `You have ${remainingIterations} turns remaining. Please continue with your analysis or take the next action needed.`;
        }

        currentMessages.push({
          role: 'user',
          content: continuationPrompt,
          isInternal: true,
        });
      }
    }

    if (iteration >= maxIterations) {
      responses.push('\n[Agent mode reached maximum iterations limit]');
    }

    return {
      content: responses.join('\n\n'),
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    };
  }
}
