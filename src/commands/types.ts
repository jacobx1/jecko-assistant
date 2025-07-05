import { JSX } from 'react';
import { Config } from '../schemas/config.js';

export interface SlashCommand {
  name: string;
  description: string;
  execute: (
    config: Config,
    onConfigUpdate?: (newConfig: Config) => void
  ) => Promise<JSX.Element | null>;
}

export interface CommandMatch {
  command: SlashCommand;
  score: number;
}
