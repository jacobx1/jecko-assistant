#!/usr/bin/env node

import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { loadConfig, createSampleConfig, getConfigPath } from './config.js';
import { ChatApp } from './chat.js';
import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { join } from 'path';

const program = new Command();

program
  .name('jecko')
  .description('AI chat assistant CLI with OpenAI, Ink, and tool support')
  .version('1.0.0');

program
  .command('chat')
  .description('Start interactive chat session')
  .action(async () => {
    try {
      const config = await loadConfig();
      render(React.createElement(ChatApp, { config }));
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      console.log(chalk.yellow('\nTo create a sample config file, run:'));
      console.log(chalk.cyan('jecko config --init'));
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Manage configuration')
  .option('--init', 'Create a sample configuration file')
  .option('--show', 'Show current configuration')
  .action(async (options) => {
    if (options.init) {
      const configPath = join(process.cwd(), '.jecko.config.json');
      try {
        writeFileSync(configPath, createSampleConfig());
        console.log(
          chalk.green('✓'),
          `Sample config created at: ${configPath}`
        );
        console.log(
          chalk.yellow('Please edit the file and add your API keys.')
        );
      } catch (error) {
        console.error(chalk.red('Error creating config:'), error);
        process.exit(1);
      }
    } else if (options.show) {
      try {
        const config = await loadConfig();
        console.log(chalk.green('Current configuration:'));
        console.log(
          JSON.stringify(
            {
              ...config,
              openai: { ...config.openai, apiKey: '***' },
              serper: { ...config.serper, apiKey: '***' },
            },
            null,
            2
          )
        );
      } catch (error) {
        console.error(
          chalk.red('Error loading config:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    } else {
      console.log(chalk.yellow('Config file locations (searched in order):'));
      getConfigPath().forEach((path, index) => {
        console.log(`${index + 1}. ${path}`);
      });
    }
  });

program.parse();
