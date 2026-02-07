/**
 * Tests for Conversation Module
 * 
 * Tests the following requirements:
 * - 1.2 单聊会话创建 - conversationId 由双方 userId 派生
 * - 1.3 群聊会话创建与加入
 * - 5.3 密钥交换 - ECDH + HKDF for direct, ECIES for group key distribution
 * - 4.3 撤回权限验证
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';

import { Identity } from '../identity/identity.js';
import {
  Conversation,
  deriveDirectConversationId,
  generateGroupId,
} from './conversation.js';
import { ConversationManager, InMemoryPublicKeyResolver } from './manager.js';
import { InMemoryStorageBackend } from '../identity/storage.js';
import { deriveSessionKey } from '../crypto/ecdh.js';

describe('Direct Conversation ID Derivation', () => {
  /**
   * **Validates: Requirements 1.2 (单聊会话创建)**
   * 单聊会话 ID 由双方 userId 确定性生成（排序后哈希）
   */
  it('should derive same conversation ID regardless of user order', () => {
    fc.assert(
      fc.property(
        fc.hexaString({ minLength: 40, maxLength: 40 }),
        fc.hexaString({ minLength: 40, maxLength: 40 }),
        (userId1, userId2) => {
          const convId1 = deriveDirectConversationId(userId1, userId2);
          const convId2 = deriveDirectConversationId(userId2, userId1);
          
          expect(convId1).toBe(convId2);
          expect(convId1.length).toBe(32); // 16 bytes as hex
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should derive different IDs for different user pairs', () => {
    const alice = Identity.create();
    const bob = Identity.create();
    const charlie = Identity.create();

    const aliceBobId = deriveDirectConversationId(alice.userId, bob.userId);
    const aliceCharlieId = deriveDirectConversationId(alice.userId, charlie.userId);
    const bobCharlieId = deriveDirectConversationId(bob.userId, charlie.userId);

    expect(aliceBobId).not.toBe(aliceCharlieId);
    expect(aliceBobId).not.toBe(bobCharlieId);
    expect(aliceCharlieId).not.toBe(bobCharlieId);
  });
});


describe('Direct Conversation Creation', () => {
  /**
   * **Validates: Requirements 1.2 (单聊会话创建)**
   * 通过对方 userId 创建单聊会话
   */
  it('should create direct conversation with correct properties', () => {
    const alice = Identity.create();
    const bob = Identity.create();

    const conversation = Conversation.createDirect(
      {
        myUserId: alice.userId,
        peerUserId: bob.userId,
        peerPublicKey: bob.publicKey,
      },
      alice.privateKey
    );

    expect(conversation.type).toBe('direct');
    expect(conversation.members).toContain(alice.userId);
    expect(conversation.members).toContain(bob.userId);
    expect(conversation.members.length).toBe(2);
    expect(conversation.admins.length).toBe(0);
    expect(conversation.sessionKey.length).toBe(32);
  });

  /**
   * **Validates: Requirements 5.3 (密钥交换)**
   * 单聊使用 ECDH 派生共享密钥
   */
  it('should derive same session key for both parties', () => {
    const alice = Identity.create();
    const bob = Identity.create();

    const aliceConv = Conversation.createDirect(
      {
        myUserId: alice.userId,
        peerUserId: bob.userId,
        peerPublicKey: bob.publicKey,
      },
      alice.privateKey
    );

    const bobConv = Conversation.createDirect(
      {
        myUserId: bob.userId,
        peerUserId: alice.userId,
        peerPublicKey: alice.publicKey,
      },
      bob.privateKey
    );

    // Both should have the same conversation ID
    expect(aliceConv.id).toBe(bobConv.id);

    // Both should derive the same session key
    expect(aliceConv.sessionKey).toEqual(bobConv.sessionKey);
  });

  it('should derive session key using ECDH + HKDF', () => {
    const alice = Identity.create();
    const bob = Identity.create();

    const conversation = Conversation.createDirect(
      {
        myUserId: alice.userId,
        peerUserId: bob.userId,
        peerPublicKey: bob.publicKey,
      },
      alice.privateKey
    );

    // Manually derive the expected session key
    const expectedKey = deriveSessionKey(
      alice.privateKey,
      bob.publicKey,
      conversation.id
    );

    expect(conversation.sessionKey).toEqual(expectedKey);
  });
});


describe('Group Conversation Creation', () => {
  /**
   * **Validates: Requirements 1.3 (群聊会话创建与加入)**
   * 创建群聊时生成唯一群组 ID，创建者自动成为群管理员
   */
  it('should create group with unique ID and creator as admin', () => {
    const creator = Identity.create();

    const group = Conversation.createGroup({
      name: 'Test Group',
      creatorUserId: creator.userId,
    });

    expect(group.type).toBe('group');
    expect(group.name).toBe('Test Group');
    expect(group.id.length).toBeGreaterThan(0);
    expect(group.members).toContain(creator.userId);
    expect(group.admins).toContain(creator.userId);
    expect(group.sessionKey.length).toBe(32);
    expect(group.groupKeyVersion).toBe(1);
  });

  it('should generate unique group IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateGroupId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('Group Join and Leave', () => {
  /**
   * **Validates: Requirements 1.3 (群聊会话创建与加入)**
   * 其他用户可通过群组 ID 加入群聊
   */
  it('should allow joining group with invite data', async () => {
    const creator = Identity.create();
    const joiner = Identity.create();

    const group = Conversation.createGroup({
      name: 'Test Group',
      creatorUserId: creator.userId,
    });

    // Create invite for joiner
    const invite = await group.createInvite(joiner.publicKey);

    // Join the group
    const joinedGroup = await Conversation.joinGroup(
      invite,
      joiner.userId,
      joiner.privateKey
    );

    expect(joinedGroup.id).toBe(group.id);
    expect(joinedGroup.name).toBe(group.name);
    expect(joinedGroup.sessionKey).toEqual(group.sessionKey);
    expect(joinedGroup.members).toContain(joiner.userId);
  });

  /**
   * **Validates: Requirements 1.3 (群聊会话创建与加入)**
   * 支持离开群聊功能
   */
  it('should allow removing members from group', () => {
    const creator = Identity.create();
    const member = Identity.create();

    const group = Conversation.createGroup({
      name: 'Test Group',
      creatorUserId: creator.userId,
    });

    group.addMember(member.userId);
    expect(group.members).toContain(member.userId);

    group.removeMember(member.userId);
    expect(group.members).not.toContain(member.userId);
  });
});


describe('Group Key Distribution', () => {
  /**
   * **Validates: Requirements 5.3 (密钥交换)**
   * 群聊使用群组密钥，加入时分发（ECIES 加密）
   */
  it('should encrypt group key for new member using ECIES', async () => {
    const creator = Identity.create();
    const newMember = Identity.create();

    const group = Conversation.createGroup({
      name: 'Test Group',
      creatorUserId: creator.userId,
    });

    const invite = await group.createInvite(newMember.publicKey);

    // The encrypted key should be decryptable by the new member
    const joinedGroup = await Conversation.joinGroup(
      invite,
      newMember.userId,
      newMember.privateKey
    );

    expect(joinedGroup.sessionKey).toEqual(group.sessionKey);
  });

  /**
   * **Validates: Requirements 5.3 (密钥交换)**
   * 支持密钥更新机制
   */
  it('should support key rotation', () => {
    const creator = Identity.create();

    const group = Conversation.createGroup({
      name: 'Test Group',
      creatorUserId: creator.userId,
    });

    const originalKey = new Uint8Array(group.sessionKey);
    const originalVersion = group.groupKeyVersion;

    const newKey = group.rotateGroupKey();

    expect(group.sessionKey).toEqual(newKey);
    expect(group.sessionKey).not.toEqual(originalKey);
    expect(group.groupKeyVersion).toBe(originalVersion + 1);
  });
});

describe('Admin Permission Management', () => {
  /**
   * **Validates: Requirements 1.3 (群聊会话创建与加入)**
   * 群聊支持成员列表管理
   */
  it('should allow setting and removing admin status', () => {
    const creator = Identity.create();
    const member = Identity.create();

    const group = Conversation.createGroup({
      name: 'Test Group',
      creatorUserId: creator.userId,
    });

    group.addMember(member.userId);
    expect(group.isAdmin(member.userId)).toBe(false);

    group.setAdmin(member.userId, true);
    expect(group.isAdmin(member.userId)).toBe(true);

    group.setAdmin(member.userId, false);
    expect(group.isAdmin(member.userId)).toBe(false);
  });

  it('should not allow setting admin for non-members', () => {
    const creator = Identity.create();
    const nonMember = Identity.create();

    const group = Conversation.createGroup({
      name: 'Test Group',
      creatorUserId: creator.userId,
    });

    expect(() => group.setAdmin(nonMember.userId, true)).toThrow();
  });
});


describe('Revoke Permission Verification', () => {
  /**
   * **Validates: Requirements 4.3 (撤回权限验证)**
   * 单聊中只有原发送者可撤回
   */
  it('should only allow sender to revoke in direct conversation', () => {
    const alice = Identity.create();
    const bob = Identity.create();

    const conversation = Conversation.createDirect(
      {
        myUserId: alice.userId,
        peerUserId: bob.userId,
        peerPublicKey: bob.publicKey,
      },
      alice.privateKey
    );

    // Alice sent a message, Alice can revoke
    expect(conversation.canRevoke(alice.userId, alice.userId)).toBe(true);

    // Bob cannot revoke Alice's message
    expect(conversation.canRevoke(bob.userId, alice.userId)).toBe(false);

    // Bob sent a message, Bob can revoke
    expect(conversation.canRevoke(bob.userId, bob.userId)).toBe(true);
  });

  /**
   * **Validates: Requirements 4.3 (撤回权限验证)**
   * 群聊中原发送者或管理员可撤回
   */
  it('should allow sender or admin to revoke in group conversation', () => {
    const admin = Identity.create();
    const member = Identity.create();
    const otherMember = Identity.create();

    const group = Conversation.createGroup({
      name: 'Test Group',
      creatorUserId: admin.userId,
    });

    group.addMember(member.userId);
    group.addMember(otherMember.userId);

    // Member sent a message
    // Member can revoke their own message
    expect(group.canRevoke(member.userId, member.userId)).toBe(true);

    // Admin can revoke member's message
    expect(group.canRevoke(admin.userId, member.userId)).toBe(true);

    // Other member cannot revoke
    expect(group.canRevoke(otherMember.userId, member.userId)).toBe(false);
  });
});

describe('ConversationManager', () => {
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

    // Should return same conversation if called again
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

  it('should persist conversations across manager instances', async () => {
    const group = await manager.createGroupConversation('Persistent Group');
    const groupId = group.id;

    // Create new manager with same storage
    const newManager = new ConversationManager(alice, storageBackend, publicKeyResolver);
    await newManager.init();

    const retrieved = newManager.getConversation(groupId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Persistent Group');
    expect(retrieved?.sessionKey).toEqual(group.sessionKey);
  });
});
