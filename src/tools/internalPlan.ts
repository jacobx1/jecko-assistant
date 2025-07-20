import { z } from 'zod';
import { createTool } from '../utils/toolInfra.js';

// Internal state to store the current plan (in-memory for now)
let currentPlan: {
  goal: string;
  steps: Array<{
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'skipped';
    notes?: string;
  }>;
  createdAt: number;
  updatedAt: number;
} | null = null;

export const AgentPlanCreateTool = createTool({
  name: 'agent_plan_create',
  description: 'Create an agent execution plan for complex tasks. This is for the agent\'s own planning and tracking, NOT for external productivity tools like Todoist. Use this to break down user requests into manageable steps.',
  schema: z.object({
    goal: z.string().min(1).describe('The overall goal or objective to accomplish'),
    steps: z.array(z.object({
      description: z.string().min(1).describe('Description of this step'),
      id: z.string().min(1).describe('Unique identifier for this step (e.g., "step1", "create_project", etc.)')
    })).min(1).describe('Array of steps needed to accomplish the goal')
  }),
  formatToolCall: ({ goal, steps }) => {
    const stepsList = steps
      .map((step, idx) => `${idx + 1}. ⏳ ${step.description}`)
      .join('\n');
    
    return `📋 Creating execution plan: "${goal}"\n\n${stepsList}`;
  },
  execute: async ({ goal, steps }, config) => {
    const now = Date.now();
    
    currentPlan = {
      goal,
      steps: steps.map(step => ({
        ...step,
        status: 'pending' as const
      })),
      createdAt: now,
      updatedAt: now
    };

    const stepsList = currentPlan.steps
      .map((step, idx) => `${idx + 1}. [${step.status.toUpperCase()}] ${step.description} (ID: ${step.id})`)
      .join('\n');

    return `📋 Internal execution plan created:

**Goal:** ${goal}

**Steps:**
${stepsList}

Use agent_plan_update to mark steps as in_progress, completed, or add notes as you work through them.`;
  },
});

export const AgentPlanUpdateTool = createTool({
  name: 'agent_plan_update',
  description: 'Update the agent execution plan by changing step status, adding notes, or adding new steps. This helps track progress through complex tasks.',
  schema: z.object({
    step_id: z.string().min(1).describe('The ID of the step to update'),
    status: z.enum(['pending', 'in_progress', 'completed', 'skipped']).optional().describe('New status for the step'),
    notes: z.string().optional().describe('Additional notes or observations about this step'),
    add_steps: z.array(z.object({
      description: z.string().min(1).describe('Description of the new step'),
      id: z.string().min(1).describe('Unique identifier for the new step'),
      after_step_id: z.string().optional().describe('Insert after this step ID (if not provided, adds to end)')
    })).optional().describe('New steps to add to the plan')
  }),
  formatToolCall: ({ step_id, status }) => {
    const statusEmoji = status === 'completed' ? '✅' : 
                       status === 'in_progress' ? '🔄' : 
                       status === 'skipped' ? '⏭️' : '⏳';
    return `📝 Updating plan step "${step_id}" ${statusEmoji}`;
  },
  execute: async ({ step_id, status, notes, add_steps }, config) => {
    if (!currentPlan) {
      throw new Error('No agent plan exists. Create one first using agent_plan_create.');
    }

    // Find and update the specified step
    const stepIndex = currentPlan.steps.findIndex(step => step.id === step_id);
    if (stepIndex === -1) {
      throw new Error(`Step with ID "${step_id}" not found in current plan.`);
    }

    // Update step
    if (status !== null && status !== undefined) {
      currentPlan.steps[stepIndex].status = status;
    }
    if (notes !== null && notes !== undefined) {
      currentPlan.steps[stepIndex].notes = notes;
    }

    // Add new steps if specified
    if (add_steps !== null && add_steps !== undefined && add_steps.length > 0) {
      for (const newStep of add_steps) {
        const insertStep = {
          ...newStep,
          status: 'pending' as const
        };

        if (newStep.after_step_id !== null && newStep.after_step_id !== undefined) {
          const afterIndex = currentPlan.steps.findIndex(step => step.id === newStep.after_step_id);
          if (afterIndex !== -1) {
            currentPlan.steps.splice(afterIndex + 1, 0, insertStep);
          } else {
            currentPlan.steps.push(insertStep);
          }
        } else {
          currentPlan.steps.push(insertStep);
        }
      }
    }

    currentPlan.updatedAt = Date.now();

    // Generate status summary
    const statusCounts = currentPlan.steps.reduce((acc, step) => {
      acc[step.status] = (acc[step.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const stepsList = currentPlan.steps
      .map((step, idx) => {
        const statusIcon = step.status === 'completed' ? '✅' : 
                          step.status === 'in_progress' ? '🔄' : 
                          step.status === 'skipped' ? '⏭️' : '⏳';
        const notesText = step.notes ? ` (Notes: ${step.notes})` : '';
        return `${idx + 1}. ${statusIcon} [${step.status.toUpperCase()}] ${step.description} (ID: ${step.id})${notesText}`;
      })
      .join('\n');

    return `📋 Agent plan updated:

**Goal:** ${currentPlan.goal}

**Progress:** ${statusCounts.completed || 0} completed, ${statusCounts.in_progress || 0} in progress, ${statusCounts.pending || 0} pending, ${statusCounts.skipped || 0} skipped

**Steps:**
${stepsList}`;
  },
});

export const AgentDoneTool = createTool({
  name: 'agent_done',
  description: 'Signal that the current task is completely finished. Use this when you have successfully accomplished all aspects of the user\'s request and no further actions are needed.',
  schema: z.object({
    summary: z.string().min(1).describe('A brief summary of what was accomplished and completed'),
    final_status: z.enum(['success', 'partial_success', 'unable_to_complete']).describe('The completion status of the task'),
    next_steps: z.string().optional().describe('Any recommended next steps for the user (if applicable)')
  }),
  formatToolCall: ({ summary, final_status }) => {
    const statusEmoji = final_status === 'success' ? '✅' : 
                       final_status === 'partial_success' ? '⚠️' : '❌';
    return `${statusEmoji} Task completed: ${summary}`;
  },
  execute: async ({ summary, final_status, next_steps }, config) => {
    const statusEmoji = final_status === 'success' ? '✅' : 
                       final_status === 'partial_success' ? '⚠️' : '❌';
    
    let result = `${statusEmoji} Task completed with status: ${final_status}

**Summary:** ${summary}`;

    if (next_steps !== null && next_steps !== undefined) {
      result += `\n\n**Recommended next steps:** ${next_steps}`;
    }

    result += '\n\n🔚 Agent task execution complete.';

    return result;
  },
});

// Helper function to get current plan (for debugging/inspection)
export const getCurrentPlan = () => currentPlan;