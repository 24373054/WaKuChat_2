/**
 * Conversation management commands
 * - create-dm: Create a direct message conversation
 * - create-group: Create a group conversation
 * - join-group: Join an existing group
 * - list: List all conversations
 * - leave: Leave a conversation
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import { ChatClient, Identity, Conversation } from '@waku-chat/sdk';
import {
  loadIdentityFromFile,
  identityExists,
  saveConversation,
  loadConversations,
  deleteConversation as removeConversation,
  getConversation,
  bytesToHex,
  hexToBytes,
  truncate,
  formatTimestamp,
  type StoredConversationData,
} from '../utils/index.js';

export const conversationCommand = new Command('conversation')
  .alias('conv')
  .description('Manage conversations');

/**
 * Create a direct message conversation
 */
conversationCommand
  .command('create-dm')
  .description('Create a direct message conversation with another user')
  .action(async () => {
    try {
      if (!identityExists()) {
        console.log('No identity found. Create one with: waku-chat identity create');
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

      const identity = await loadIdentityFromFile(password);

      const { peerUserId, peerPublicKey } = await inquirer.prompt([
        {
          type: 'input',
          name: 'peerUserId',
          message: 'Enter the peer\'s User ID:',
          validate: (input: string) => input.length > 0 || 'User ID is required',
        },
        {
          type: 'input',
          name: 'peerPublicKey',
          message: 'Enter the peer\'s Public Key (hex):',
          validate: (input: string) => {
            if (input.length === 0) return 'Public key is required';
            if (!/^[0-9a-fA-F]+$/.test(input)) return 'Invalid hex string';
            return true;
          },
        },
      ]);

      // Create ChatClient and conversation
      const client = new ChatClient();
      client.setIdentity(identity);
      
      const peerPubKeyBytes = hexToBytes(peerPublicKey);
      const conversation = await client.createDirectConversation(peerUserId, peerPubKeyBytes);

      // Store conversation data
      const convData: StoredConversationData = {
        id: conversation.id,
        type: 'direct',
        members: conversation.members,
        admins: [],
        peerPublicKey: peerPublicKey,
        sessionKey: bytesToHex(conversation.sessionKey),
      };
      saveConversation(convData);

      console.log('\n✓ Direct conversation created!');
      console.log(`  Conversation ID: ${conversation.id}`);
      console.log(`  Peer: ${peerUserId}`);
    } catch (error) {
      console.error('Error creating conversation:', (error as Error).message);
      process.exit(1);
    }
  });


/**
 * Create a group conversation
 */
conversationCommand
  .command('create-group')
  .description('Create a new group conversation')
  .action(async () => {
    try {
      if (!identityExists()) {
        console.log('No identity found. Create one with: waku-chat identity create');
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

      const identity = await loadIdentityFromFile(password);

      const { groupName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'groupName',
          message: 'Enter group name:',
          validate: (input: string) => input.length > 0 || 'Group name is required',
        },
      ]);

      // Create ChatClient and group
      const client = new ChatClient();
      client.setIdentity(identity);
      
      const conversation = await client.createGroupConversation(groupName);

      // Store conversation data
      const convData: StoredConversationData = {
        id: conversation.id,
        type: 'group',
        name: groupName,
        members: conversation.members,
        admins: conversation.admins,
        sessionKey: bytesToHex(conversation.sessionKey),
      };
      saveConversation(convData);

      console.log('\n✓ Group created!');
      console.log(`  Group ID: ${conversation.id}`);
      console.log(`  Name: ${groupName}`);
      console.log(`  You are the admin.`);
      console.log('\nShare this invite data with others to let them join:');
      
      // Generate invite data for display
      const inviteInfo = {
        groupId: conversation.id,
        groupName: groupName,
        adminPublicKey: bytesToHex(identity.publicKey),
      };
      console.log(JSON.stringify(inviteInfo, null, 2));
    } catch (error) {
      console.error('Error creating group:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Join a group conversation
 */
conversationCommand
  .command('join-group')
  .description('Join an existing group conversation')
  .action(async () => {
    try {
      if (!identityExists()) {
        console.log('No identity found. Create one with: waku-chat identity create');
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

      const identity = await loadIdentityFromFile(password);

      const { inviteJson } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'inviteJson',
          message: 'Paste the invite data (JSON):',
        },
      ]);

      let inviteData;
      try {
        inviteData = JSON.parse(inviteJson);
      } catch {
        console.error('Invalid JSON format');
        process.exit(1);
      }

      // For simplified CLI, we'll create a group conversation directly
      // In a real scenario, the invite would include encrypted group key
      const { groupId, groupName, encryptedGroupKey, members = [], admins = [] } = inviteData;

      if (!groupId) {
        console.error('Invalid invite data: missing groupId');
        process.exit(1);
      }

      // If we have encrypted group key, use full join flow
      // Otherwise, create a simple group entry (for demo purposes)
      let sessionKey: Uint8Array;
      
      if (encryptedGroupKey) {
        // Full invite flow with encrypted key
        const client = new ChatClient();
        client.setIdentity(identity);
        
        const conversation = await client.joinGroupConversation({
          groupId,
          groupName: groupName || 'Unnamed Group',
          encryptedGroupKey: hexToBytes(encryptedGroupKey),
          members,
          admins,
          keyVersion: 1,
        });
        sessionKey = conversation.sessionKey;
      } else {
        // Simplified flow - generate shared key from group ID (demo only)
        // In production, this should always use encrypted key exchange
        const encoder = new TextEncoder();
        const { sha256 } = await import('@noble/hashes/sha256');
        sessionKey = sha256(encoder.encode(groupId + ':shared-key'));
      }

      // Store conversation data
      const convData: StoredConversationData = {
        id: groupId,
        type: 'group',
        name: groupName || 'Unnamed Group',
        members: [...members, identity.userId],
        admins: admins,
        sessionKey: bytesToHex(sessionKey),
      };
      saveConversation(convData);

      console.log('\n✓ Joined group!');
      console.log(`  Group ID: ${groupId}`);
      console.log(`  Name: ${groupName || 'Unnamed Group'}`);
    } catch (error) {
      console.error('Error joining group:', (error as Error).message);
      process.exit(1);
    }
  });


/**
 * List all conversations
 */
conversationCommand
  .command('list')
  .description('List all conversations')
  .action(async () => {
    try {
      const conversations = loadConversations();

      if (conversations.length === 0) {
        console.log('No conversations found.');
        console.log('Create one with: waku-chat conversation create-dm');
        console.log('             or: waku-chat conversation create-group');
        return;
      }

      console.log('\n=== Conversations ===\n');
      
      for (const conv of conversations) {
        const typeIcon = conv.type === 'direct' ? '👤' : '👥';
        const name = conv.name || (conv.type === 'direct' ? 'Direct Message' : 'Group');
        
        console.log(`${typeIcon} ${name}`);
        console.log(`   ID: ${conv.id}`);
        console.log(`   Type: ${conv.type}`);
        console.log(`   Members: ${conv.members.length}`);
        if (conv.type === 'group' && conv.admins.length > 0) {
          console.log(`   Admins: ${conv.admins.length}`);
        }
        console.log('');
      }
    } catch (error) {
      console.error('Error listing conversations:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Show conversation details
 */
conversationCommand
  .command('show')
  .description('Show conversation details')
  .argument('<id>', 'Conversation ID')
  .action(async (id: string) => {
    try {
      const conv = getConversation(id);

      if (!conv) {
        console.error(`Conversation not found: ${id}`);
        process.exit(1);
      }

      console.log('\n=== Conversation Details ===\n');
      console.log(`ID:      ${conv.id}`);
      console.log(`Type:    ${conv.type}`);
      if (conv.name) {
        console.log(`Name:    ${conv.name}`);
      }
      console.log(`Members: ${conv.members.join(', ')}`);
      if (conv.type === 'group' && conv.admins.length > 0) {
        console.log(`Admins:  ${conv.admins.join(', ')}`);
      }
    } catch (error) {
      console.error('Error showing conversation:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Leave/delete a conversation
 */
conversationCommand
  .command('leave')
  .description('Leave and delete a conversation')
  .argument('<id>', 'Conversation ID')
  .action(async (id: string) => {
    try {
      const conv = getConversation(id);

      if (!conv) {
        console.error(`Conversation not found: ${id}`);
        process.exit(1);
      }

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to leave "${conv.name || conv.id}"?`,
          default: false,
        },
      ]);

      if (!confirm) {
        console.log('Aborted.');
        return;
      }

      removeConversation(id);
      console.log('\n✓ Left conversation.');
    } catch (error) {
      console.error('Error leaving conversation:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Generate invite for a group
 */
conversationCommand
  .command('invite')
  .description('Generate invite data for a group')
  .argument('<id>', 'Group ID')
  .action(async (id: string) => {
    try {
      if (!identityExists()) {
        console.log('No identity found. Create one with: waku-chat identity create');
        return;
      }

      const conv = getConversation(id);

      if (!conv) {
        console.error(`Conversation not found: ${id}`);
        process.exit(1);
      }

      if (conv.type !== 'group') {
        console.error('Can only generate invites for group conversations');
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

      const identity = await loadIdentityFromFile(password);

      // For a real implementation, we would encrypt the group key for the invitee
      // Here we provide basic invite info
      const inviteInfo = {
        groupId: conv.id,
        groupName: conv.name,
        members: conv.members,
        admins: conv.admins,
        inviterPublicKey: bytesToHex(identity.publicKey),
      };

      console.log('\n=== Invite Data ===');
      console.log('Share this with the person you want to invite:\n');
      console.log(JSON.stringify(inviteInfo, null, 2));
    } catch (error) {
      console.error('Error generating invite:', (error as Error).message);
      process.exit(1);
    }
  });
