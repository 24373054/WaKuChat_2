/**
 * Interactive CLI Mode
 * 完整的交互式命令行界面
 */

import inquirer from 'inquirer';
import { ChatClient, Identity, type Message } from '@waku-chat/sdk';
import {
  loadIdentityFromFile,
  saveIdentityToFile,
  identityExists,
  loadConversations,
  saveConversation,
  getConversation,
  deleteConversation,
  bytesToHex,
  hexToBytes,
  truncate,
  formatTimestamp,
  type StoredConversationData,
} from './utils/index.js';

let client: ChatClient | null = null;
let currentIdentity: Identity | null = null;

/**
 * 显示 ASCII Logo
 */
function showBanner(): void {
  console.clear();
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██╗    ██╗ █████╗ ██╗  ██╗██╗   ██╗ ██████╗██╗  ██╗    ║
║   ██║    ██║██╔══██╗██║ ██╔╝██║   ██║██╔════╝██║  ██║    ║
║   ██║ █╗ ██║███████║█████╔╝ ██║   ██║██║     ███████║    ║
║   ██║███╗██║██╔══██║██╔═██╗ ██║   ██║██║     ██╔══██║    ║
║   ╚███╔███╔╝██║  ██║██║  ██╗╚██████╔╝╚██████╗██║  ██║    ║
║    ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝    ║
║                                                           ║
║          Decentralized Encrypted Chat on Waku             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
}

/**
 * 主菜单
 */
async function mainMenu(): Promise<void> {
  showBanner();
  
  const hasIdentity = identityExists();
  const isConnected = client !== null;
  
  // 状态栏
  console.log('─'.repeat(60));
  if (currentIdentity) {
    console.log(`  👤 User: ${truncate(currentIdentity.userId, 20)}`);
    console.log(`  🔗 Status: ${isConnected ? '✅ Connected' : '❌ Disconnected'}`);
  } else {
    console.log('  👤 User: Not logged in');
  }
  console.log('─'.repeat(60));
  console.log('');

  const choices = [];
  
  if (!currentIdentity) {
    if (hasIdentity) {
      choices.push({ name: '🔓 Login (unlock identity)', value: 'login' });
    }
    choices.push({ name: '✨ Create new identity', value: 'create' });
    choices.push({ name: '📥 Import identity', value: 'import' });
  } else {
    choices.push({ name: '💬 Conversations', value: 'conversations' });
    choices.push({ name: '👤 My Identity', value: 'identity' });
    choices.push({ name: '🔌 Reconnect', value: 'reconnect' });
    choices.push({ name: '🚪 Logout', value: 'logout' });
  }
  
  choices.push({ name: '❌ Exit', value: 'exit' });

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices,
    },
  ]);

  switch (action) {
    case 'login':
      await login();
      break;
    case 'create':
      await createIdentity();
      break;
    case 'import':
      await importIdentity();
      break;
    case 'conversations':
      await conversationsMenu();
      break;
    case 'identity':
      await showIdentity();
      break;
    case 'reconnect':
      await connect();
      break;
    case 'logout':
      await logout();
      break;
    case 'exit':
      await cleanup();
      console.log('\nGoodbye! 👋\n');
      process.exit(0);
  }

  // 循环回主菜单
  await mainMenu();
}

/**
 * 登录（解锁身份）
 */
async function login(): Promise<void> {
  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Enter your password:',
      mask: '*',
    },
  ]);

  try {
    console.log('\n🔓 Unlocking identity...');
    currentIdentity = await loadIdentityFromFile(password);
    console.log('✅ Identity unlocked!');
    await connect();
  } catch (error) {
    console.error('❌ Failed to unlock:', (error as Error).message);
    await pause();
  }
}

/**
 * 创建新身份
 */
async function createIdentity(): Promise<void> {
  const { password, confirmPassword } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Choose a password (min 6 characters):',
      mask: '*',
      validate: (input) => input.length >= 6 || 'Password must be at least 6 characters',
    },
    {
      type: 'password',
      name: 'confirmPassword',
      message: 'Confirm password:',
      mask: '*',
    },
  ]);

  if (password !== confirmPassword) {
    console.error('❌ Passwords do not match');
    await pause();
    return;
  }

  try {
    console.log('\n✨ Creating identity...');
    currentIdentity = Identity.create();
    await saveIdentityToFile(currentIdentity, password);
    
    console.log('✅ Identity created!');
    console.log(`   User ID: ${currentIdentity.userId}`);
    console.log(`   Public Key: ${truncate(bytesToHex(currentIdentity.publicKey), 40)}`);
    
    await connect();
  } catch (error) {
    console.error('❌ Failed to create identity:', (error as Error).message);
    await pause();
  }
}

/**
 * 导入身份
 */
async function importIdentity(): Promise<void> {
  const { data, oldPassword, newPassword, confirmPassword } = await inquirer.prompt([
    {
      type: 'editor',
      name: 'data',
      message: 'Paste your identity JSON (will open editor):',
    },
    {
      type: 'password',
      name: 'oldPassword',
      message: 'Password for the imported identity:',
      mask: '*',
    },
    {
      type: 'password',
      name: 'newPassword',
      message: 'New password for local storage:',
      mask: '*',
      validate: (input) => input.length >= 6 || 'Password must be at least 6 characters',
    },
    {
      type: 'password',
      name: 'confirmPassword',
      message: 'Confirm new password:',
      mask: '*',
    },
  ]);

  if (newPassword !== confirmPassword) {
    console.error('❌ Passwords do not match');
    await pause();
    return;
  }

  try {
    console.log('\n📥 Importing identity...');
    currentIdentity = await Identity.import(data.trim(), oldPassword);
    await saveIdentityToFile(currentIdentity, newPassword);
    
    console.log('✅ Identity imported!');
    console.log(`   User ID: ${currentIdentity.userId}`);
    
    await connect();
  } catch (error) {
    console.error('❌ Failed to import:', (error as Error).message);
    await pause();
  }
}

/**
 * 连接到 Waku 网络
 */
async function connect(): Promise<void> {
  if (!currentIdentity) return;

  try {
    console.log('\n🔗 Connecting to Waku network...');
    
    if (client) {
      await client.destroy();
    }
    
    client = new ChatClient();
    await client.init({
      lightMode: true,
      onConnectionChange: (connected) => {
        if (!connected) {
          console.log('\n⚠️  Connection lost');
        }
      },
    });
    
    await client.setIdentity(currentIdentity);
    console.log('✅ Connected to Waku network!');
    await pause();
  } catch (error) {
    console.error('❌ Connection failed:', (error as Error).message);
    await pause();
  }
}

/**
 * 显示身份信息
 */
async function showIdentity(): Promise<void> {
  if (!currentIdentity) return;

  console.clear();
  console.log('\n👤 Your Identity\n');
  console.log('─'.repeat(60));
  console.log(`  User ID:    ${currentIdentity.userId}`);
  console.log(`  Public Key: ${bytesToHex(currentIdentity.publicKey)}`);
  console.log('─'.repeat(60));
  console.log('\n💡 Share your User ID and Public Key with others to chat.\n');

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Options:',
      choices: [
        { name: '📋 Copy User ID', value: 'copy-id' },
        { name: '📋 Copy Public Key', value: 'copy-key' },
        { name: '📤 Export Identity', value: 'export' },
        { name: '← Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'export') {
    await exportIdentity();
  } else if (action === 'copy-id') {
    console.log(`\n📋 User ID:\n${currentIdentity.userId}\n`);
    await pause();
  } else if (action === 'copy-key') {
    console.log(`\n📋 Public Key:\n${bytesToHex(currentIdentity.publicKey)}\n`);
    await pause();
  }
}

/**
 * 导出身份
 */
async function exportIdentity(): Promise<void> {
  if (!currentIdentity) return;

  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Password to encrypt export:',
      mask: '*',
    },
  ]);

  try {
    const exported = await currentIdentity.export(password);
    console.log('\n📤 Exported Identity (save this JSON):\n');
    console.log(exported);
    console.log('');
    await pause();
  } catch (error) {
    console.error('❌ Export failed:', (error as Error).message);
    await pause();
  }
}

/**
 * 登出
 */
async function logout(): Promise<void> {
  await cleanup();
  currentIdentity = null;
  console.log('\n🚪 Logged out.\n');
  await pause();
}

/**
 * 会话菜单
 */
async function conversationsMenu(): Promise<void> {
  console.clear();
  console.log('\n💬 Conversations\n');

  const conversations = loadConversations();
  
  const choices = [
    { name: '➕ New Direct Message', value: 'new-dm' },
    { name: '➕ New Group', value: 'new-group' },
    { name: '📥 Join Group', value: 'join-group' },
    new inquirer.Separator(),
  ];

  if (conversations.length > 0) {
    for (const conv of conversations) {
      const icon = conv.type === 'direct' ? '👤' : '👥';
      const name = conv.name || truncate(conv.id, 20);
      choices.push({ name: `${icon} ${name}`, value: `chat:${conv.id}` });
    }
    choices.push(new inquirer.Separator());
  }

  choices.push({ name: '← Back', value: 'back' });

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: conversations.length > 0 ? 'Select a conversation or create new:' : 'No conversations yet:',
      choices,
    },
  ]);

  if (action === 'new-dm') {
    await createDirectMessage();
  } else if (action === 'new-group') {
    await createGroup();
  } else if (action === 'join-group') {
    await joinGroup();
  } else if (action.startsWith('chat:')) {
    const convId = action.slice(5);
    await chatInConversation(convId);
  } else if (action === 'back') {
    return;
  }

  await conversationsMenu();
}

/**
 * 创建单聊
 */
async function createDirectMessage(): Promise<void> {
  if (!client || !currentIdentity) {
    console.error('❌ Not connected');
    await pause();
    return;
  }

  const { peerUserId, peerPublicKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'peerUserId',
      message: 'Peer User ID:',
      validate: (input) => input.length > 0 || 'Required',
    },
    {
      type: 'input',
      name: 'peerPublicKey',
      message: 'Peer Public Key (hex):',
      validate: (input) => input.length > 0 || 'Required',
    },
  ]);

  try {
    console.log('\n✨ Creating conversation...');
    const conv = await client.createDirectConversation(peerUserId, hexToBytes(peerPublicKey));
    
    const convData: StoredConversationData = {
      id: conv.id,
      type: 'direct',
      members: conv.members,
      admins: [],
      peerPublicKey,
      sessionKey: bytesToHex(conv.sessionKey),
    };
    saveConversation(convData);
    
    console.log('✅ Conversation created!');
    console.log(`   ID: ${conv.id}`);
    await pause();
  } catch (error) {
    console.error('❌ Failed:', (error as Error).message);
    await pause();
  }
}

/**
 * 创建群组
 */
async function createGroup(): Promise<void> {
  if (!client || !currentIdentity) {
    console.error('❌ Not connected');
    await pause();
    return;
  }

  const { groupName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'groupName',
      message: 'Group name:',
      validate: (input) => input.length > 0 || 'Required',
    },
  ]);

  try {
    console.log('\n✨ Creating group...');
    const conv = await client.createGroupConversation(groupName);
    
    const convData: StoredConversationData = {
      id: conv.id,
      type: 'group',
      name: groupName,
      members: conv.members,
      admins: conv.admins,
      sessionKey: bytesToHex(conv.sessionKey),
    };
    saveConversation(convData);
    
    console.log('✅ Group created!');
    console.log(`   ID: ${conv.id}`);
    await pause();
  } catch (error) {
    console.error('❌ Failed:', (error as Error).message);
    await pause();
  }
}

/**
 * 加入群组
 */
async function joinGroup(): Promise<void> {
  if (!client || !currentIdentity) {
    console.error('❌ Not connected');
    await pause();
    return;
  }

  const { inviteData } = await inquirer.prompt([
    {
      type: 'editor',
      name: 'inviteData',
      message: 'Paste invite JSON (will open editor):',
    },
  ]);

  try {
    console.log('\n📥 Joining group...');
    const invite = JSON.parse(inviteData.trim());
    
    const conv = await client.joinGroupConversation({
      groupId: invite.groupId,
      groupName: invite.groupName || 'Group',
      encryptedGroupKey: hexToBytes(invite.encryptedGroupKey),
      members: invite.members || [],
      admins: invite.admins || [],
      keyVersion: invite.keyVersion || 1,
    });
    
    const convData: StoredConversationData = {
      id: conv.id,
      type: 'group',
      name: invite.groupName || 'Group',
      members: conv.members,
      admins: conv.admins,
      sessionKey: bytesToHex(conv.sessionKey),
    };
    saveConversation(convData);
    
    console.log('✅ Joined group!');
    await pause();
  } catch (error) {
    console.error('❌ Failed:', (error as Error).message);
    await pause();
  }
}

/**
 * 在会话中聊天
 */
async function chatInConversation(conversationId: string): Promise<void> {
  if (!client || !currentIdentity) {
    console.error('❌ Not connected');
    await pause();
    return;
  }

  const conv = getConversation(conversationId);
  if (!conv) {
    console.error('❌ Conversation not found');
    await pause();
    return;
  }

  // 恢复会话到 client
  try {
    if (conv.type === 'direct' && conv.peerPublicKey) {
      const peerUserId = conv.members.find(m => m !== currentIdentity!.userId) || conv.members[0];
      await client.createDirectConversation(peerUserId, hexToBytes(conv.peerPublicKey));
    } else if (conv.type === 'group') {
      await client.joinGroupConversation({
        groupId: conv.id,
        groupName: conv.name || 'Group',
        encryptedGroupKey: hexToBytes(conv.sessionKey),
        members: conv.members,
        admins: conv.admins,
        keyVersion: 1,
      });
    }
  } catch {
    // 可能已经存在，忽略
  }

  console.clear();
  const convName = conv.name || truncate(conv.id, 20);
  console.log(`\n💬 ${convName}\n`);
  console.log('─'.repeat(60));
  console.log('  Commands: /send <msg>, /history, /revoke <id>, /invite, /back');
  console.log('─'.repeat(60));

  // 订阅消息
  let unsubscribe: (() => void) | null = null;
  try {
    unsubscribe = await client.subscribe(conversationId, (msg: Message) => {
      if (msg.senderId !== currentIdentity!.userId) {
        const time = formatTimestamp(msg.timestamp);
        const sender = truncate(msg.senderId, 12);
        if (msg.status === 'revoked') {
          console.log(`\n[${time}] ${sender}: [Message revoked]`);
        } else {
          console.log(`\n[${time}] ${sender}: ${msg.content}`);
        }
      }
    });
  } catch {
    // 忽略订阅错误
  }

  // 拉取历史
  try {
    const history = await client.fetchHistory(conversationId, { limit: 10 });
    if (history.length > 0) {
      console.log('\n--- Recent messages ---');
      for (const msg of history) {
        const time = formatTimestamp(msg.timestamp);
        const sender = msg.senderId === currentIdentity!.userId ? 'You' : truncate(msg.senderId, 12);
        if (msg.status === 'revoked') {
          console.log(`[${time}] ${sender}: [Message revoked]`);
        } else {
          console.log(`[${time}] ${sender}: ${msg.content}`);
        }
      }
      console.log('--- End ---\n');
    }
  } catch {
    // 忽略历史拉取错误
  }

  // 聊天循环
  while (true) {
    const { input } = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message: '>',
      },
    ]);

    const trimmed = input.trim();
    if (!trimmed) continue;

    if (trimmed === '/back' || trimmed === '/exit') {
      if (unsubscribe) unsubscribe();
      return;
    }

    if (trimmed === '/history') {
      try {
        const history = await client.fetchHistory(conversationId, { limit: 20 });
        console.log('\n--- History ---');
        for (const msg of history) {
          const time = formatTimestamp(msg.timestamp);
          const sender = msg.senderId === currentIdentity!.userId ? 'You' : truncate(msg.senderId, 12);
          console.log(`[${time}] ${sender}: ${msg.status === 'revoked' ? '[Revoked]' : msg.content}`);
          console.log(`   ID: ${msg.id}`);
        }
        console.log('--- End ---\n');
      } catch (error) {
        console.error('❌ Failed:', (error as Error).message);
      }
      continue;
    }

    if (trimmed.startsWith('/revoke ')) {
      const msgId = trimmed.slice(8).trim();
      try {
        await client.revokeMessage(conversationId, msgId);
        console.log('✅ Message revoked');
      } catch (error) {
        console.error('❌ Failed:', (error as Error).message);
      }
      continue;
    }

    if (trimmed === '/invite' && conv.type === 'group') {
      await generateInvite(conversationId, conv.name || 'Group');
      continue;
    }

    if (trimmed.startsWith('/send ')) {
      const content = trimmed.slice(6);
      try {
        await client.sendMessage(conversationId, content);
        const time = formatTimestamp(Date.now());
        console.log(`[${time}] You: ${content}`);
      } catch (error) {
        console.error('❌ Failed:', (error as Error).message);
      }
      continue;
    }

    // 直接发送消息
    if (!trimmed.startsWith('/')) {
      try {
        await client.sendMessage(conversationId, trimmed);
        const time = formatTimestamp(Date.now());
        console.log(`[${time}] You: ${trimmed}`);
      } catch (error) {
        console.error('❌ Failed:', (error as Error).message);
      }
    }
  }
}

/**
 * 生成群邀请
 */
async function generateInvite(groupId: string, groupName: string): Promise<void> {
  if (!client) return;

  const { userId, publicKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'userId',
      message: 'Invitee User ID:',
    },
    {
      type: 'input',
      name: 'publicKey',
      message: 'Invitee Public Key (hex):',
    },
  ]);

  try {
    const invite = await client.inviteToGroup(groupId, userId, hexToBytes(publicKey));
    const inviteJson = JSON.stringify({
      groupId: invite.groupId,
      groupName: invite.groupName,
      encryptedGroupKey: bytesToHex(invite.encryptedGroupKey),
      members: invite.members,
      admins: invite.admins,
      keyVersion: invite.keyVersion,
    }, null, 2);
    
    console.log('\n📤 Invite (share this with the invitee):\n');
    console.log(inviteJson);
    console.log('');
    await pause();
  } catch (error) {
    console.error('❌ Failed:', (error as Error).message);
    await pause();
  }
}

/**
 * 清理资源
 */
async function cleanup(): Promise<void> {
  if (client) {
    await client.destroy();
    client = null;
  }
}

/**
 * 暂停等待用户按键
 */
async function pause(): Promise<void> {
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: 'Press Enter to continue...',
    },
  ]);
}

/**
 * 启动交互式界面
 */
export async function startInteractive(): Promise<void> {
  // 处理 Ctrl+C
  process.on('SIGINT', async () => {
    await cleanup();
    console.log('\n\nGoodbye! 👋\n');
    process.exit(0);
  });

  await mainMenu();
}
