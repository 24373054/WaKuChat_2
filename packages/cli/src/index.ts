/**
 * Waku Encrypted Chat CLI
 * A command-line interface for the Waku encrypted chat SDK
 */

import { Command } from 'commander';
import { identityCommand } from './commands/identity.js';
import { conversationCommand } from './commands/conversation.js';
import { messageCommand } from './commands/message.js';
import { chatCommand } from './commands/chat.js';

const program = new Command();

program
  .name('waku-chat')
  .description('CLI for Waku encrypted chat SDK')
  .version('1.0.0');

// Register commands
program.addCommand(identityCommand);
program.addCommand(conversationCommand);
program.addCommand(messageCommand);
program.addCommand(chatCommand);

// Parse arguments
program.parse();
