import {
  TodoistApi,
  Task,
  AddTaskArgs,
  AddProjectArgs,
} from '@doist/todoist-api-typescript';
import { z } from 'zod';
import { createTool } from '../utils/toolInfra.js';

export const TodoistCreateTaskTool = createTool({
  name: 'todoist_create_task',
  description:
    'Create a new task in Todoist. IMPORTANT: Always specify project_id when creating tasks for a specific project to organize them properly.',
  schema: z.object({
    content: z.string().min(1).describe('The task content/title'),
    description: z
      .string()
      .optional()
      .describe('Additional details for the task'),
    project_id: z
      .string()
      .optional()
      .describe(
        'REQUIRED for organizing tasks: The exact Project ID (numeric string) where this task should be created. Use the ID from todoist_create_project or todoist_get_projects.'
      ),
    due_string: z
      .string()
      .optional()
      .describe(
        'Due date in natural language. Examples: "tomorrow", "next Monday", "today at 3pm", "next week", "every Sunday", "no date" (to remove due date). Uses local time, up to 150 characters. Be specific and natural - Todoist parses human-readable dates very well.'
      ),
    priority: z
      .number()
      .min(1)
      .max(4)
      .optional()
      .describe('Priority level (1-4, where 4 is urgent)'),
    labels: z
      .array(z.string())
      .optional()
      .describe('Array of label names to assign to the task'),
  }),
  execute: async (
    { content, description, project_id, due_string, priority, labels },
    config
  ) => {
    const apiKey = config.todoist?.apiKey;
    if (!apiKey) {
      throw new Error(
        'Todoist API key not configured. Please add your Todoist API key to the configuration.'
      );
    }

    const api = new TodoistApi(apiKey);

    try {
      const taskArgs: AddTaskArgs = {
        content,
        ...(description !== null && description !== undefined && { description }),
        ...(project_id !== null && project_id !== undefined && { project_id }),
        ...(due_string !== null && due_string !== undefined && { due_string }),
        ...(priority !== null && priority !== undefined && { priority }),
        ...(labels !== null && labels !== undefined && { labels }),
      };

      const task = await api.addTask(taskArgs);

      return `✅ Task created successfully:
**${task.content}**
- ID: ${task.id}
- Project: ${task.projectId}
- Due: ${task.due?.string || 'No due date'}
- Priority: ${task.priority}
- URL: ${task.url}`;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          throw new Error(
            'Invalid Todoist API key. Please check your configuration.'
          );
        }
        if (error.message.includes('403')) {
          throw new Error(
            'Access denied. Please check your Todoist API permissions.'
          );
        }
        throw new Error(`Todoist API error: ${error.message}`);
      }
      throw new Error('Failed to create task in Todoist: Unknown error');
    }
  },
});

export const TodoistGetTasksTool = createTool({
  name: 'todoist_get_tasks',
  description: 'Get tasks from Todoist with optional filtering',
  schema: z.object({
    project_id: z.string().optional().describe('Filter tasks by project ID'),
    label_id: z.string().optional().describe('Filter tasks by label ID'),
    filter: z
      .string()
      .optional()
      .describe('Filter string (e.g., "today", "overdue", "p1")'),
    lang: z
      .string()
      .optional()
      .describe('Language for natural language filters'),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(20)
      .describe('Maximum number of tasks to return (1-100)'),
  }),
  execute: async ({ project_id, label_id, filter, lang, limit }, config) => {
    const apiKey = config.todoist?.apiKey;
    if (!apiKey) {
      throw new Error(
        'Todoist API key not configured. Please add your Todoist API key to the configuration.'
      );
    }

    const api = new TodoistApi(apiKey);

    try {
      const tasks = await api.getTasks({
        ...(project_id !== null && project_id !== undefined && { projectId: project_id }),
        ...(label_id !== null && label_id !== undefined && { label_id }),
        ...(filter !== null && filter !== undefined && { filter }),
        ...(lang !== null && lang !== undefined && { lang }),
      });

      if (tasks.results.length === 0) {
        return 'No tasks found matching the criteria.';
      }

      const limitedTasks = tasks.results.slice(0, limit);
      const results: string[] = [
        `📋 Found ${tasks.results.length} task(s) (showing ${limitedTasks.length}):`,
      ];

      limitedTasks.forEach((task: Task, index: number) => {
        results.push(`\n${index + 1}. **${task.content}**`);
        if (task.description) {
          results.push(`   Description: ${task.description}`);
        }
        results.push(`   ID: ${task.id}`);
        results.push(`   Project: ${task.projectId}`);
        results.push(`   Priority: ${task.priority}`);
        if (task.due) {
          results.push(`   Due: ${task.due.string}`);
        }
        if (task.labels && task.labels.length > 0) {
          results.push(`   Labels: ${task.labels.join(', ')}`);
        }
        results.push(`   URL: ${task.url}`);
      });

      return results.join('\n');
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          throw new Error(
            'Invalid Todoist API key. Please check your configuration.'
          );
        }
        if (error.message.includes('403')) {
          throw new Error(
            'Access denied. Please check your Todoist API permissions.'
          );
        }
        throw new Error(`Todoist API error: ${error.message}`);
      }
      throw new Error('Failed to get tasks from Todoist: Unknown error');
    }
  },
});

export const TodoistGetProjectsTool = createTool({
  name: 'todoist_get_projects',
  description:
    'Get all projects from Todoist with their Project IDs for use in task creation. IMPORTANT - always use this tool to get the correct project_id for the project you want to create a task in.',
  schema: z.object({}),
  execute: async ({}, config) => {
    const apiKey = config.todoist?.apiKey;
    if (!apiKey) {
      throw new Error(
        'Todoist API key not configured. Please add your Todoist API key to the configuration.'
      );
    }

    const api = new TodoistApi(apiKey);

    try {
      const projects = await api.getProjects();

      if (projects.results.length === 0) {
        return 'No projects found in your Todoist account.';
      }

      const results: string[] = [
        `📂 Found ${projects.results.length} project(s):`,
      ];

      projects.results.forEach((project, index) => {
        results.push(`\n${index + 1}. **${project.name}**`);
        results.push(`   Project ID: ${project.id}`);
        if (project.color) {
          results.push(`   Color: ${project.color}`);
        }
        results.push(`   URL: ${project.url}`);
      });

      return results.join('\n');
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          throw new Error(
            'Invalid Todoist API key. Please check your configuration.'
          );
        }
        if (error.message.includes('403')) {
          throw new Error(
            'Access denied. Please check your Todoist API permissions.'
          );
        }
        throw new Error(`Todoist API error: ${error.message}`);
      }
      throw new Error('Failed to get projects from Todoist: Unknown error');
    }
  },
});

export const TodoistCompleteTaskTool = createTool({
  name: 'todoist_complete_task',
  description: 'Complete (close) a task in Todoist by its ID',
  schema: z.object({
    task_id: z.string().min(1).describe('The ID of the task to complete'),
  }),
  execute: async ({ task_id }, config) => {
    const apiKey = config.todoist?.apiKey;
    if (!apiKey) {
      throw new Error(
        'Todoist API key not configured. Please add your Todoist API key to the configuration.'
      );
    }

    const api = new TodoistApi(apiKey);

    try {
      const isSuccess = await api.closeTask(task_id);

      if (isSuccess) {
        return `✅ Task completed successfully! Task ID: ${task_id}`;
      } else {
        return `❌ Failed to complete task. Task ID: ${task_id}`;
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          throw new Error(
            'Invalid Todoist API key. Please check your configuration.'
          );
        }
        if (error.message.includes('403')) {
          throw new Error(
            'Access denied. Please check your Todoist API permissions.'
          );
        }
        if (error.message.includes('404')) {
          throw new Error(
            `Task not found. Please check the task ID: ${task_id}`
          );
        }
        throw new Error(`Todoist API error: ${error.message}`);
      }
      throw new Error('Failed to complete task in Todoist: Unknown error');
    }
  },
});

export const TodoistCreateProjectTool = createTool({
  name: 'todoist_create_project',
  description:
    'Create a new project in Todoist. Returns the project ID that should be used when creating tasks for this project.',
  schema: z.object({
    name: z.string().min(1).describe('The project name'),
  }),
  execute: async ({ name }, config) => {
    const apiKey = config.todoist?.apiKey;
    if (!apiKey) {
      throw new Error(
        'Todoist API key not configured. Please add your Todoist API key to the configuration.'
      );
    }

    const api = new TodoistApi(apiKey);

    try {
      const projectArgs: AddProjectArgs = {
        name,
      };

      const project = await api.addProject(projectArgs);

      return `📂 Project created successfully:
**${project.name}**
- Project ID: ${project.id}

🔗 IMPORTANT: Use Project ID "${project.id}" in the project_id field when creating tasks for this project.`;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          throw new Error(
            'Invalid Todoist API key. Please check your configuration.'
          );
        }
        if (error.message.includes('403')) {
          throw new Error(
            'Access denied. Please check your Todoist API permissions.'
          );
        }
        throw new Error(`Todoist API error: ${error.message}`);
      }
      throw new Error('Failed to create project in Todoist: Unknown error');
    }
  },
});
