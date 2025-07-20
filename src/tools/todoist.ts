import { TodoistApi, Task, AddTaskArgs, AddProjectArgs } from '@doist/todoist-api-typescript';
import { z } from 'zod';
import { createTool } from '../utils/toolInfra.js';

export const TodoistCreateTaskTool = createTool({
  name: 'todoist_create_task',
  description: 'Create a new task in Todoist',
  schema: z.object({
    content: z.string().min(1).describe('The task content/title'),
    description: z
      .string()
      .optional()
      .describe('Additional details for the task'),
    project_id: z
      .string()
      .optional()
      .describe('Project ID to create the task in'),
    due_string: z
      .string()
      .optional()
      .describe(
        'Due date in natural language (e.g., "tomorrow", "next Monday")'
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
        ...(description && { description }),
        ...(project_id && { project_id }),
        ...(due_string && { due_string }),
        ...(priority && { priority }),
        ...(labels && { labels }),
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
        ...(project_id && { projectId: project_id }),
        ...(label_id && { label_id }),
        ...(filter && { filter }),
        ...(lang && { lang }),
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
  description: 'Get all projects from Todoist',
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

      const results: string[] = [`📂 Found ${projects.results.length} project(s):`];

      projects.results.forEach((project, index) => {
        results.push(`\n${index + 1}. **${project.name}**`);
        results.push(`   ID: ${project.id}`);
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
  description: 'Create a new project in Todoist',
  schema: z.object({
    name: z.string().min(1).describe('The project name'),
    color: z.string().optional().describe('Project color (e.g., "red", "blue", "green")'),
    favorite: z.boolean().optional().describe('Whether to mark project as favorite'),
  }),
  execute: async ({ name, color, favorite }, config) => {
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
        ...(color && { color }),
        ...(favorite !== undefined && { favorite }),
      };

      const project = await api.addProject(projectArgs);
      
      return `📂 Project created successfully:
**${project.name}**
- ID: ${project.id}
- Color: ${project.color || 'Default'}
- URL: ${project.url}`;
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
