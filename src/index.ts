#!/usr/bin/env node

import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { Provider } from 'react-redux';
import { loadConfig, createSampleConfig, getConfigPath } from './config.js';
import { ChatApp } from './chat.js';
import { store } from './store/index.js';
import { startMCPServer } from './mcpServer.js';
import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { join } from 'path';

const program = new Command();

program
  .name('jecko')
  .description('AI chat assistant CLI with OpenAI, Ink, and tool support')
  .version('1.0.0');

// Global cleanup functions
const cleanupFunctions: (() => Promise<void>)[] = [];
let inkInstance: any = null;

// Enhanced signal handlers for graceful shutdown
const cleanup = async () => {
  console.log('\n\nShutting down gracefully...');
  
  // Cleanup Ink instance first
  if (inkInstance) {
    try {
      inkInstance.unmount();
      inkInstance.cleanup();
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  // Run other cleanup functions
  await Promise.allSettled(cleanupFunctions.map(fn => fn()));
  
  // Force exit if needed
  setTimeout(() => {
    console.log('Force exiting...');
    process.exit(1);
  }, 3000);
  
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGQUIT', cleanup);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanup();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  cleanup();
});

program
  .command('chat')
  .description('Start interactive chat session')
  .action(async () => {
    try {
      const config = await loadConfig();
      
      // Create the app with cleanup callback, wrapped in Redux Provider
      const chatApp = React.createElement(ChatApp, { 
        config,
        onClientCreate: (disconnectFn: () => Promise<void>) => {
          cleanupFunctions.push(disconnectFn);
        }
      });
      
      const app = React.createElement(Provider, { store, children: chatApp });
      
      // Store the Ink instance for cleanup
      inkInstance = render(app);
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

program
  .command('mcp')
  .description('Start MCP server on stdio')
  .action(async () => {
    try {
      await startMCPServer();
    } catch (error) {
      console.error(
        chalk.red('Error starting MCP server:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });

program.parse();
