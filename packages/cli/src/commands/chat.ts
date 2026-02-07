/**
 * Interactive chat mode
 * Provides a real-time chat experience with message sending and receiving
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import * as readline from 'readline';
import { ChatClient, type Message } from '@waku-chat/sdk';
import {
  loadIdentityFromFile,
  identityExists,
  getConversation,
  loadConversations,
  hexToBytes,
  formatTimestamp,
  truncate,
  type StoredConversationData,
} from '../utils/index.js';

export const chatCommand = new Command('chat')
  .description('Start interactive chat mode')
  .argument('[conversation-id]', 'Conversation ID (optional, will prompt if not provided)')
  .action(async (conversationIdArg?: string) => {
    try {
      if (!identityExists()) {
        console.log('No identity found. Create one with: waku-chat identity create');
        return;
      }

      // Get conversation ID
      let conversationId = conversationIdArg;
      if (!conversationId) {
        const conversations = loadConversations();
        if (conversations.length === 0) {
          console.log('No conversations found. Create one first with:');
          console.log('  waku-chat conversation create-dm');
          console.log('  waku-chat conversation create-group');
          return;
        }

        const { selectedConv } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedConv',
            message: 'Select a conversation to chat in:',
            choices: conversations.map(c => ({
              name: `${c.type === 'direct' ? '👤' : '👥'} ${c.name || truncate(c.id, 20)}`,
              value: c.id,
            })),
          },
        ]);
        conversationId = selectedConv;
      }

      const conv = getConversation(conversationId!);
      if (!conv) {
        console.error(`Conversation not found: ${conversationId}`);
        process.exit(1);
      }

      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your password:',
          mask: '*',
        },
      ]);

      console.log('\nConnecting to Waku network...');
      
      const identity = await loadIdentityFromFile(password);
      const client = new ChatClient();
      
      await client.init({
        lightMode: true,
        onConnectionChange: (connected) => {
          if (!connected) {
            console.log('\n⚠ Connection lost. Attempting to reconnect...');
          }
        },
        onError: (error) => {
          console.error('\n⚠ Error:', error.message);
        },
      });
      
      client.setIdentity(identity);

      // Restore conversation in client
      const sessionKey = hexToBytes(conv.sessionKey);
      
      if (conv.type === 'direct' && conv.peerPublicKey) {
        const peerUserId = conv.members.find(m => m !== identity.userId) || conv.members[0];
        await client.createDirectConversation(peerUserId, hexToBytes(conv.peerPublicKey));
      } else if (conv.type === 'group') {
        await client.joinGroupConversation({
          groupId: conv.id,
          groupName: conv.name || 'Group',
          encryptedGroupKey: sessionKey,
          members: conv.members,
          admins: conv.admins,
          keyVersion: 1,
        });
      }

      // Start interactive chat
      await startInteractiveChat(client, identity.userId, conv);

    } catch (error) {
      console.error('Error starting chat:', (error as Error).message);
      process.exit(1);
    }
  });


/**
 * Start interactive chat session
 */
async function startInteractiveChat(
  client: ChatClient,
  myUserId: string,
  conv: StoredConversationData
): Promise<void> {
  const conversationId = conv.id;
  const convName = conv.name || truncate(conv.id, 20);

  // Print header
  console.log('\n' + '='.repeat(50));
  console.log(`  Interactive Chat: ${convName}`);
  console.log(`  Type: ${conv.type === 'direct' ? 'Direct Message' : 'Group'}`);
  console.log('='.repeat(50));
  console.log('\nCommands:');
  console.log('  /quit or /exit  - Exit chat');
  console.log('  /history        - Show recent messages');
  console.log('  /revoke <id>    - Revoke a message');
  console.log('  /members        - Show conversation members');
  console.log('  /help           - Show this help');
  console.log('\nType your message and press Enter to send.\n');

  // Subscribe to incoming messages
  const unsubscribe = await client.subscribe(conversationId, (message: Message) => {
    // Don't show our own messages (we already printed them when sending)
    if (message.senderId === myUserId) {
      return;
    }
    displayMessage(message, myUserId);
  });

  // Create readline interface for input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Handle input
  const promptForInput = () => {
    rl.question('> ', async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        promptForInput();
        return;
      }

      // Handle commands
      if (trimmed.startsWith('/')) {
        const handled = await handleCommand(trimmed, client, conversationId, myUserId, conv);
        if (handled === 'exit') {
          console.log('\nDisconnecting...');
          unsubscribe();
          await client.destroy();
          rl.close();
          console.log('Goodbye!');
          process.exit(0);
        }
        promptForInput();
        return;
      }

      // Send message
      try {
        const messageId = await client.sendMessage(conversationId, trimmed);
        const time = formatTimestamp(Date.now());
        console.log(`[${time}] You: ${trimmed}`);
        console.log(`   ID: ${truncate(messageId, 16)}`);
      } catch (error) {
        console.error('Failed to send:', (error as Error).message);
      }

      promptForInput();
    });
  };

  // Handle Ctrl+C gracefully
  rl.on('close', async () => {
    console.log('\nDisconnecting...');
    unsubscribe();
    await client.destroy();
    process.exit(0);
  });

  // Start prompting
  promptForInput();
}

/**
 * Display a received message
 */
function displayMessage(message: Message, myUserId: string): void {
  const time = formatTimestamp(message.timestamp);
  const sender = message.senderId === myUserId ? 'You' : truncate(message.senderId, 12);
  const verified = message.verified ? '✓' : '?';

  console.log(''); // New line before message
  
  if (message.status === 'revoked') {
    console.log(`[${time}] ${sender} ${verified}: [Message revoked]`);
  } else {
    console.log(`[${time}] ${sender} ${verified}: ${message.content}`);
  }
  console.log(`   ID: ${truncate(message.id, 16)}`);
  console.log(''); // New line after message
  
  // Re-print the prompt
  process.stdout.write('> ');
}

/**
 * Handle chat commands
 */
async function handleCommand(
  input: string,
  client: ChatClient,
  conversationId: string,
  myUserId: string,
  conv: StoredConversationData
): Promise<string | void> {
  const parts = input.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case 'quit':
    case 'exit':
    case 'q':
      return 'exit';

    case 'help':
    case 'h':
    case '?':
      console.log('\nCommands:');
      console.log('  /quit, /exit, /q  - Exit chat');
      console.log('  /history [n]      - Show last n messages (default: 10)');
      console.log('  /revoke <id>      - Revoke a message by ID');
      console.log('  /members          - Show conversation members');
      console.log('  /info             - Show conversation info');
      console.log('  /help, /h, /?     - Show this help');
      console.log('');
      break;

    case 'history':
      try {
        const limit = parseInt(args[0] || '10', 10);
        console.log('\nFetching history...');
        const messages = await client.fetchHistory(conversationId, { limit });
        
        if (messages.length === 0) {
          console.log('No messages found.\n');
        } else {
          console.log(`\n--- Last ${messages.length} message(s) ---\n`);
          for (const msg of messages) {
            displayMessageCompact(msg, myUserId);
          }
          console.log('--- End of history ---\n');
        }
      } catch (error) {
        console.error('Failed to fetch history:', (error as Error).message);
      }
      break;

    case 'revoke':
      if (args.length === 0) {
        console.log('Usage: /revoke <message-id>');
        break;
      }
      try {
        const messageId = args[0];
        await client.revokeMessage(conversationId, messageId);
        console.log(`✓ Message ${truncate(messageId, 16)} revoked.\n`);
      } catch (error) {
        console.error('Failed to revoke:', (error as Error).message);
      }
      break;

    case 'members':
      console.log('\nMembers:');
      for (const member of conv.members) {
        const isMe = member === myUserId ? ' (you)' : '';
        const isAdmin = conv.admins.includes(member) ? ' [admin]' : '';
        console.log(`  - ${truncate(member, 20)}${isMe}${isAdmin}`);
      }
      console.log('');
      break;

    case 'info':
      console.log('\nConversation Info:');
      console.log(`  ID: ${conv.id}`);
      console.log(`  Type: ${conv.type}`);
      if (conv.name) {
        console.log(`  Name: ${conv.name}`);
      }
      console.log(`  Members: ${conv.members.length}`);
      if (conv.type === 'group') {
        console.log(`  Admins: ${conv.admins.length}`);
      }
      console.log('');
      break;

    default:
      console.log(`Unknown command: /${command}. Type /help for available commands.\n`);
  }
}

/**
 * Display a message in compact format (for history)
 */
function displayMessageCompact(message: Message, myUserId: string): void {
  const time = formatTimestamp(message.timestamp);
  const sender = message.senderId === myUserId ? 'You' : truncate(message.senderId, 12);
  const verified = message.verified ? '✓' : '?';

  if (message.status === 'revoked') {
    console.log(`[${time}] ${sender} ${verified}: [Message revoked]`);
  } else {
    console.log(`[${time}] ${sender} ${verified}: ${message.content}`);
  }
  console.log(`   ID: ${message.id}`);
}
