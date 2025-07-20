import { type SlashCommand, type CommandMatch } from './types.js';
import { configCommand } from './config.js';
import { toolsCommand } from './tools.js';
import { compactCommand } from './compact.js';
import { exitCommand } from './exit.js';
import { debugCommand } from './debug.js';

const commands: SlashCommand[] = [configCommand, toolsCommand, compactCommand, exitCommand, debugCommand];

export function getAllCommands(): SlashCommand[] {
  return [...commands];
}

export type { CommandMatch };

export function searchCommands(query: string): CommandMatch[] {
  if (!query.startsWith('/')) {
    return [];
  }

  const searchTerm = query.slice(1).toLowerCase();

  if (searchTerm === '') {
    return commands.map((command) => ({ command, score: 1 }));
  }

  const matches: CommandMatch[] = [];

  for (const command of commands) {
    const name = command.name.toLowerCase();
    const description = command.description.toLowerCase();

    let score = 0;

    // Exact match gets highest score
    if (name === searchTerm) {
      score = 100;
    }
    // Starts with search term gets high score
    else if (name.startsWith(searchTerm)) {
      score = 80;
    }
    // Contains search term gets medium score
    else if (name.includes(searchTerm)) {
      score = 60;
    }
    // Description contains search term gets low score
    else if (description.includes(searchTerm)) {
      score = 40;
    }

    if (score > 0) {
      matches.push({ command, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

export function getCommand(name: string): SlashCommand | undefined {
  return commands.find((cmd) => cmd.name === name);
}
