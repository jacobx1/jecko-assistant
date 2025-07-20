import { JSX } from 'react';

// Store active command JSX outside of Redux to maintain serializability
class CommandManager {
  private activeCommandJSX: JSX.Element | null = null;

  setCommand(jsx: JSX.Element | null) {
    this.activeCommandJSX = jsx;
  }

  getCommand(): JSX.Element | null {
    return this.activeCommandJSX;
  }

  clear() {
    this.activeCommandJSX = null;
  }
}

export const commandManager = new CommandManager();