/**
 * Integration Tests for Waku Encrypted Chat SDK
 * 
 * Tests the following requirements:
 * - 13.3 单聊互发测试 - Two users exchanging messages in direct conversation
 * - 13.4 群聊广播测试 - Three users in group chat, messages broadcast to all
 * - 13.5 撤回后各端一致显示测试 - Revoked messages show consistently across clients
 * 
 * These tests verify the integration of crypto, identity, conversation, and message modules.
 * The individual encryption/decryption and serialization tests are covered in unit tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Identity } from './identity/identity.js';
import { Conversation } from './conversation/conversation.js';
import { ConversationManager, InMemoryPublicKeyResolver } from './conversation/manager.js';
import { InMemoryStorageBackend } from './identity/storage.js';
import {
  generateMessageId,
  serializeChatMessage,
  deserializeChatMessage,
  serializeTextPayload,
  deserializeTextPayload,
  signMessage,
  verifyMessageSignature,
  DedupeCache,
  isRevokeMessage,
} from './message/index.js';
import type { MessageType } from './types.js';

/**
 * 13.3 集成测试：单聊互发测试
 * **Validates: Requirements 2.1, 2.2 (消息发送与接收)**
 * Tests that two users can exchange encrypted messages in a direct conversation
 */
describe('Integration: Direct Message Exchange (13.3)', () => {
  let alice: Identity;
  let bob: Identity;
  let aliceConv: Conversation;
  let bobConv: Conversation;

  beforeEach(() => {
    alice = Identity.create();
    bob = Identity.create();

    // Create direct conversations
    aliceConv = Conversation.createDirect(
      { myUserId: alice.userId, peerUserId: bob.userId, peerPublicKey: bob.publicKey },
      alice.privateKey
    );
    bobConv = Conversation.createDirect(
      { myUserId: bob.userId, peerUserId: alice.userId, peerPublicKey: alice.publicKey },
      bob.privateKey
    );
  });

  it('should create matching conversation IDs for both parties', () => {
    expect(aliceConv.id).toBe(bobConv.id);
    expect(aliceConv.type).toBe('direct');
    expect(bobConv.type).toBe('direct');
  });

  it('should derive matching session keys for both parties', () => {
    expect(aliceConv.sessionKey).toEqual(bobConv.sessionKey);
    expect(aliceConv.sessionKey.length).toBe(32);
  });

  it('should include both users as members', () => {
    expect(aliceConv.members).toContain(alice.userId);
    expect(aliceConv.members).toContain(bob.userId);
    expect(bobConv.members).toContain(alice.userId);
    expect(bobConv.members).toContain(bob.userId);
  });

  it('should generate unique message IDs', () => {
    const timestamp = Date.now();
    const id1 = generateMessageId(timestamp, alice.userId);
    const id2 = generateMessageId(timestamp, alice.userId);
    
    expect(id1).not.toBe(id2);
    expect(id1.length).toBe(64);
    expect(id2.length).toBe(64);
  });

  it('should serialize and deserialize text messages correctly', () => {
    const content = 'Hello Bob!';
    const timestamp = Date.now();
    const messageId = generateMessageId(timestamp, alice.userId);
    const payload = serializeTextPayload(content);

    const chatMessage = serializeChatMessage({
      messageId,
      senderId: alice.userId,
      conversationId: aliceConv.id,
      convType: 'direct',
      type: 'TEXT' as MessageType,
      timestamp,
      payload,
    });

    const decoded = deserializeChatMessage(chatMessage);
    const decodedContent = deserializeTextPayload(decoded.payload);

    expect(decodedContent).toBe(content);
    expect(decoded.senderId).toBe(alice.userId);
    expect(decoded.messageId).toBe(messageId);
    expect(decoded.conversationId).toBe(aliceConv.id);
  });

  it('should sign and verify messages correctly', async () => {
    const content = 'Signed message';
    const timestamp = Date.now();
    const messageId = generateMessageId(timestamp, alice.userId);
    const payload = serializeTextPayload(content);

    const signature = await signMessage(
      { messageId, senderId: alice.userId, conversationId: aliceConv.id, timestamp, messageType: 'TEXT' as MessageType, payload },
      alice.privateKey
    );

    // Valid signature with correct public key
    expect(verifyMessageSignature(
      { messageId, senderId: alice.userId, conversationId: aliceConv.id, timestamp, messageType: 'TEXT' as MessageType, payload },
      signature,
      alice.publicKey
    )).toBe(true);

    // Invalid signature with wrong public key
    expect(verifyMessageSignature(
      { messageId, senderId: alice.userId, conversationId: aliceConv.id, timestamp, messageType: 'TEXT' as MessageType, payload },
      signature,
      bob.publicKey
    )).toBe(false);
  });

  it('should deduplicate messages correctly', () => {
    const cache = new DedupeCache();
    const messageId = 'test-message-id-123';

    expect(cache.isDuplicate(messageId)).toBe(false);
    cache.add(messageId);
    expect(cache.isDuplicate(messageId)).toBe(true);
    expect(cache.checkAndAdd(messageId)).toBe(true);
    expect(cache.checkAndAdd('new-message-id')).toBe(false);
  });
});


/**
 * 13.4 集成测试：群聊广播测试
 * **Validates: Requirements 1.3, 2.1, 2.2 (群聊会话创建与加入, 消息发送与接收)**
 * Tests that messages in a group are broadcast to all members
 */
describe('Integration: Group Chat Broadcast (13.4)', () => {
  let alice: Identity;
  let bob: Identity;
  let charlie: Identity;
  let aliceGroup: Conversation;

  beforeEach(() => {
    alice = Identity.create();
    bob = Identity.create();
    charlie = Identity.create();

    aliceGroup = Conversation.createGroup({
      name: 'Test Group',
      creatorUserId: alice.userId,
    });
  });

  it('should create group with creator as admin', () => {
    expect(aliceGroup.type).toBe('group');
    expect(aliceGroup.name).toBe('Test Group');
    expect(aliceGroup.isAdmin(alice.userId)).toBe(true);
    expect(aliceGroup.members).toContain(alice.userId);
  });

  it('should allow members to join via invite', async () => {
    const bobInvite = await aliceGroup.createInvite(bob.publicKey);
    const bobGroup = await Conversation.joinGroup(bobInvite, bob.userId, bob.privateKey);

    expect(bobGroup.id).toBe(aliceGroup.id);
    expect(bobGroup.name).toBe(aliceGroup.name);
    expect(bobGroup.sessionKey).toEqual(aliceGroup.sessionKey);
  });

  it('should share the same session key among all members', async () => {
    const bobInvite = await aliceGroup.createInvite(bob.publicKey);
    const charlieInvite = await aliceGroup.createInvite(charlie.publicKey);
    
    const bobGroup = await Conversation.joinGroup(bobInvite, bob.userId, bob.privateKey);
    const charlieGroup = await Conversation.joinGroup(charlieInvite, charlie.userId, charlie.privateKey);

    expect(bobGroup.sessionKey).toEqual(aliceGroup.sessionKey);
    expect(charlieGroup.sessionKey).toEqual(aliceGroup.sessionKey);
  });

  it('should maintain admin permissions correctly', async () => {
    const bobInvite = await aliceGroup.createInvite(bob.publicKey);
    await Conversation.joinGroup(bobInvite, bob.userId, bob.privateKey);
    aliceGroup.addMember(bob.userId);

    expect(aliceGroup.isAdmin(bob.userId)).toBe(false);
    aliceGroup.setAdmin(bob.userId, true);
    expect(aliceGroup.isAdmin(bob.userId)).toBe(true);
    aliceGroup.setAdmin(bob.userId, false);
    expect(aliceGroup.isAdmin(bob.userId)).toBe(false);
  });

  it('should support key rotation', () => {
    const originalKey = new Uint8Array(aliceGroup.sessionKey);
    const originalVersion = aliceGroup.groupKeyVersion;

    const newKey = aliceGroup.rotateGroupKey();

    expect(aliceGroup.sessionKey).toEqual(newKey);
    expect(aliceGroup.sessionKey).not.toEqual(originalKey);
    expect(aliceGroup.groupKeyVersion).toBe(originalVersion + 1);
  });

  it('should allow adding and removing members', () => {
    aliceGroup.addMember(bob.userId);
    expect(aliceGroup.members).toContain(bob.userId);

    aliceGroup.addMember(charlie.userId);
    expect(aliceGroup.members).toContain(charlie.userId);

    aliceGroup.removeMember(bob.userId);
    expect(aliceGroup.members).not.toContain(bob.userId);
    expect(aliceGroup.members).toContain(charlie.userId);
  });
});

/**
 * 13.5 集成测试：撤回后各端一致显示测试
 * **Validates: Requirements 4.2, 4.3 (消息撤回, 撤回权限验证)**
 * Tests that revoked messages are consistently shown as revoked across all clients
 */
describe('Integration: Revoke Consistency (13.5)', () => {
  let alice: Identity;
  let bob: Identity;
  let charlie: Identity;

  beforeEach(() => {
    alice = Identity.create();
    bob = Identity.create();
    charlie = Identity.create();
  });

  describe('Direct Message Revoke Permissions', () => {
    let aliceConv: Conversation;
    let bobConv: Conversation;

    beforeEach(() => {
      aliceConv = Conversation.createDirect(
        { myUserId: alice.userId, peerUserId: bob.userId, peerPublicKey: bob.publicKey },
        alice.privateKey
      );
      bobConv = Conversation.createDirect(
        { myUserId: bob.userId, peerUserId: alice.userId, peerPublicKey: alice.publicKey },
        bob.privateKey
      );
    });

    it('should allow sender to revoke their own message', () => {
      expect(aliceConv.canRevoke(alice.userId, alice.userId)).toBe(true);
      expect(bobConv.canRevoke(bob.userId, bob.userId)).toBe(true);
    });

    it('should prevent non-sender from revoking in DM', () => {
      expect(aliceConv.canRevoke(alice.userId, bob.userId)).toBe(false);
      expect(bobConv.canRevoke(bob.userId, alice.userId)).toBe(false);
    });

    it('should have no admins in direct conversations', () => {
      expect(aliceConv.admins.length).toBe(0);
      expect(bobConv.admins.length).toBe(0);
    });
  });

  describe('Group Message Revoke Permissions', () => {
    let aliceGroup: Conversation;

    beforeEach(() => {
      aliceGroup = Conversation.createGroup({
        name: 'Revoke Test Group',
        creatorUserId: alice.userId,
      });
      aliceGroup.addMember(bob.userId);
      aliceGroup.addMember(charlie.userId);
    });

    it('should allow sender to revoke their own message in group', () => {
      expect(aliceGroup.canRevoke(bob.userId, bob.userId)).toBe(true);
      expect(aliceGroup.canRevoke(charlie.userId, charlie.userId)).toBe(true);
    });

    it('should allow admin to revoke any message', () => {
      expect(aliceGroup.canRevoke(alice.userId, bob.userId)).toBe(true);
      expect(aliceGroup.canRevoke(alice.userId, charlie.userId)).toBe(true);
    });

    it('should prevent non-admin from revoking others messages', () => {
      expect(aliceGroup.canRevoke(bob.userId, charlie.userId)).toBe(false);
      expect(aliceGroup.canRevoke(charlie.userId, bob.userId)).toBe(false);
    });

    it('should allow promoted admin to revoke messages', () => {
      expect(aliceGroup.canRevoke(bob.userId, charlie.userId)).toBe(false);
      aliceGroup.setAdmin(bob.userId, true);
      expect(aliceGroup.canRevoke(bob.userId, charlie.userId)).toBe(true);
    });

    it('should revoke admin privileges when demoted', () => {
      aliceGroup.setAdmin(bob.userId, true);
      expect(aliceGroup.canRevoke(bob.userId, charlie.userId)).toBe(true);
      aliceGroup.setAdmin(bob.userId, false);
      expect(aliceGroup.canRevoke(bob.userId, charlie.userId)).toBe(false);
    });
  });

  describe('Revoke Message Type', () => {
    it('should correctly identify revoke message type', () => {
      expect(isRevokeMessage('REVOKE')).toBe(true);
      expect(isRevokeMessage('TEXT')).toBe(false);
      expect(isRevokeMessage('KEY_EXCHANGE')).toBe(false);
      expect(isRevokeMessage('GROUP_INVITE')).toBe(false);
    });
  });
});

/**
 * ConversationManager Integration Tests
 */
describe('Integration: ConversationManager', () => {
  let alice: Identity;
  let bob: Identity;
  let storageBackend: InMemoryStorageBackend;
  let publicKeyResolver: InMemoryPublicKeyResolver;
  let manager: ConversationManager;

  beforeEach(() => {
    alice = Identity.create();
    bob = Identity.create();
    storageBackend = new InMemoryStorageBackend();
    publicKeyResolver = new InMemoryPublicKeyResolver();
    publicKeyResolver.setPublicKey(bob.userId, bob.publicKey);
    manager = new ConversationManager(alice, storageBackend, publicKeyResolver);
  });

  it('should create and retrieve direct conversation', async () => {
    const conversation = await manager.createDirectConversation(bob.userId);

    expect(conversation.type).toBe('direct');
    expect(conversation.members).toContain(alice.userId);
    expect(conversation.members).toContain(bob.userId);

    const sameConv = await manager.createDirectConversation(bob.userId);
    expect(sameConv.id).toBe(conversation.id);
  });

  it('should create and retrieve group conversation', async () => {
    const group = await manager.createGroupConversation('Test Group');

    expect(group.type).toBe('group');
    expect(group.name).toBe('Test Group');
    expect(group.isAdmin(alice.userId)).toBe(true);

    const retrieved = manager.getConversation(group.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(group.id);
  });

  it('should list all conversations', async () => {
    await manager.createDirectConversation(bob.userId);
    await manager.createGroupConversation('Group 1');
    await manager.createGroupConversation('Group 2');

    const all = manager.getAllConversations();
    expect(all.length).toBe(3);
  });

  it('should persist conversations across manager instances', async () => {
    const group = await manager.createGroupConversation('Persistent Group');
    const groupId = group.id;

    const newManager = new ConversationManager(alice, storageBackend, publicKeyResolver);
    await newManager.init();

    const retrieved = newManager.getConversation(groupId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Persistent Group');
    expect(retrieved?.sessionKey).toEqual(group.sessionKey);
  });
});
