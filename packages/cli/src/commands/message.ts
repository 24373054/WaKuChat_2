/**
 * Message commands
 * - send: Send a message to a conversation
 * - history: View message history
 * - revoke: Revoke a sent message
 * - delete: Delete a message locally
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
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

export const messageCommand = new Command('message')
  .alias('msg')
  .description('Send and manage messages');

/**
 * Helper to create and initialize a ChatClient with conversation
 */
async function setupClient(
  password: string,
  conversationId: string
): Promise<{ client: ChatClient; conv: StoredConversationData }> {
  const identity = await loadIdentityFromFile(password);
  const conv = getConversation(conversationId);
  
  if (!conv) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  const client = new ChatClient();
  await client.init({ lightMode: true });
  client.setIdentity(identity);

  // Restore conversation in client
  const sessionKey = hexToBytes(conv.sessionKey);
  
  if (conv.type === 'direct' && conv.peerPublicKey) {
    const peerUserId = conv.members.find(m => m !== identity.userId) || conv.members[0];
    await client.createDirectConversation(peerUserId, hexToBytes(conv.peerPublicKey));
  } else if (conv.type === 'group') {
    // For groups, we need to restore the conversation with the stored session key
    await client.joinGroupConversation({
      groupId: conv.id,
      groupName: conv.name || 'Group',
      encryptedGroupKey: sessionKey, // Already decrypted, will be used directly
      members: conv.members,
      admins: conv.admins,
      keyVersion: 1,
    });
  }

  return { client, conv };
}

/**
 * Send a message to a conversation
 */
messageCommand
  .command('send')
  .description('Send a message to a conversation')
  .argument('[conversation-id]', 'Conversation ID (optional, will prompt if not provided)')
  .option('-m, --message <text>', 'Message text (optional, will prompt if not provided)')
  .action(async (conversationIdArg?: string, options?: { message?: string }) => {
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
          console.log('No conversations found. Create one first.');
          return;
        }

        const { selectedConv } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedConv',
            message: 'Select a conversation:',
            choices: conversations.map(c => ({
              name: `${c.type === 'direct' ? '👤' : '👥'} ${c.name || c.id}`,
              value: c.id,
            })),
          },
        ]);
        conversationId = selectedConv;
      }

      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your password:',
          mask: '*',
        },
      ]);

      // Get message text
      let messageText = options?.message;
      if (!messageText) {
        const { text } = await inquirer.prompt([
          {
            type: 'input',
            name: 'text',
            message: 'Enter your message:',
            validate: (input: string) => input.length > 0 || 'Message cannot be empty',
          },
        ]);
        messageText = text;
      }

      console.log('Connecting to Waku network...');
      const { client, conv } = await setupClient(password, conversationId!);

      console.log('Sending message...');
      const messageId = await client.sendMessage(conversationId!, messageText!);

      await client.destroy();

      console.log('\n✓ Message sent!');
      console.log(`  Message ID: ${messageId}`);
      console.log(`  To: ${conv.name || conv.id}`);
    } catch (error) {
      console.error('Error sending message:', (error as Error).message);
      process.exit(1);
    }
  });


/**
 * View message history
 */
messageCommand
  .command('history')
  .description('View message history for a conversation')
  .argument('[conversation-id]', 'Conversation ID (optional, will prompt if not provided)')
  .option('-l, --limit <number>', 'Maximum number of messages to fetch', '20')
  .action(async (conversationIdArg?: string, options?: { limit?: string }) => {
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
          console.log('No conversations found. Create one first.');
          return;
        }

        const { selectedConv } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedConv',
            message: 'Select a conversation:',
            choices: conversations.map(c => ({
              name: `${c.type === 'direct' ? '👤' : '👥'} ${c.name || c.id}`,
              value: c.id,
            })),
          },
        ]);
        conversationId = selectedConv;
      }

      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your password:',
          mask: '*',
        },
      ]);

      console.log('Connecting to Waku network...');
      const { client, conv } = await setupClient(password, conversationId!);

      console.log('Fetching history...');
      const limit = parseInt(options?.limit || '20', 10);
      const messages = await client.fetchHistory(conversationId!, { limit });

      await client.destroy();

      if (messages.length === 0) {
        console.log('\nNo messages found.');
        return;
      }

      console.log(`\n=== Message History (${conv.name || conv.id}) ===\n`);

      for (const msg of messages) {
        const time = formatTimestamp(msg.timestamp);
        const sender = truncate(msg.senderId, 12);
        const verified = msg.verified ? '✓' : '?';
        
        if (msg.status === 'revoked') {
          console.log(`[${time}] ${sender} ${verified}: [Message revoked]`);
        } else {
          console.log(`[${time}] ${sender} ${verified}: ${msg.content}`);
        }
        console.log(`   ID: ${msg.id}`);
        console.log('');
      }

      console.log(`Total: ${messages.length} message(s)`);
    } catch (error) {
      console.error('Error fetching history:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Revoke a message
 */
messageCommand
  .command('revoke')
  .description('Revoke a sent message (others will see it as revoked)')
  .argument('<conversation-id>', 'Conversation ID')
  .argument('<message-id>', 'Message ID to revoke')
  .option('-r, --reason <text>', 'Reason for revocation')
  .action(async (conversationId: string, messageId: string, options?: { reason?: string }) => {
    try {
      if (!identityExists()) {
        console.log('No identity found. Create one with: waku-chat identity create');
        return;
      }

      const conv = getConversation(conversationId);
      if (!conv) {
        console.error(`Conversation not found: ${conversationId}`);
        process.exit(1);
      }

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to revoke message ${truncate(messageId, 16)}?`,
          default: false,
        },
      ]);

      if (!confirm) {
        console.log('Aborted.');
        return;
      }

      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your password:',
          mask: '*',
        },
      ]);

      console.log('Connecting to Waku network...');
      const { client } = await setupClient(password, conversationId);

      console.log('Sending revoke message...');
      await client.revokeMessage(conversationId, messageId, options?.reason);

      await client.destroy();

      console.log('\n✓ Message revoked!');
      console.log('  Other participants will see this message as revoked.');
    } catch (error) {
      console.error('Error revoking message:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Delete a message locally
 */
messageCommand
  .command('delete')
  .description('Delete a message locally (only affects your device)')
  .argument('<conversation-id>', 'Conversation ID')
  .argument('<message-id>', 'Message ID to delete')
  .action(async (conversationId: string, messageId: string) => {
    try {
      if (!identityExists()) {
        console.log('No identity found. Create one with: waku-chat identity create');
        return;
      }

      const conv = getConversation(conversationId);
      if (!conv) {
        console.error(`Conversation not found: ${conversationId}`);
        process.exit(1);
      }

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Delete message ${truncate(messageId, 16)} locally? This only affects your device.`,
          default: false,
        },
      ]);

      if (!confirm) {
        console.log('Aborted.');
        return;
      }

      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your password:',
          mask: '*',
        },
      ]);

      console.log('Deleting message...');
      const { client } = await setupClient(password, conversationId);

      await client.deleteLocalMessage(conversationId, messageId);

      await client.destroy();

      console.log('\n✓ Message deleted locally.');
      console.log('  Note: Other participants can still see this message.');
    } catch (error) {
      console.error('Error deleting message:', (error as Error).message);
      process.exit(1);
    }
  });
