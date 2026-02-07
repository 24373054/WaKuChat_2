/**
 * Storage module tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStorageBackend } from './memory-backend.js';
import { LevelDBStorageBackend } from './leveldb-backend.js';
import { BaseStorage } from './base-storage.js';
import type { StoredMessage, StoredConversation, EncryptedIdentity } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

describe('MemoryStorageBackend', () => {
  let backend: MemoryStorageBackend;

  beforeEach(() => {
    backend = new MemoryStorageBackend();
  });

  it('should store and retrieve values', async () => {
    await backend.set('key1', 'value1');
    const result = await backend.get('key1');
    expect(result).toBe('value1');
  });

  it('should return null for non-existent keys', async () => {
    const result = await backend.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should delete values', async () => {
    await backend.set('key1', 'value1');
    await backend.delete('key1');
    const result = await backend.get('key1');
    expect(result).toBeNull();
  });

  it('should list keys with prefix', async () => {
    await backend.set('prefix:key1', 'value1');
    await backend.set('prefix:key2', 'value2');
    await backend.set('other:key3', 'value3');

    const keys = await backend.list('prefix:');
    expect(keys).toHaveLength(2);
    expect(keys).toContain('prefix:key1');
    expect(keys).toContain('prefix:key2');
  });

  it('should clear all data', async () => {
    await backend.set('key1', 'value1');
    await backend.set('key2', 'value2');
    await backend.clear();
    expect(backend.size()).toBe(0);
  });
});

describe('LevelDBStorageBackend', () => {
  let backend: LevelDBStorageBackend;
  const testDbPath = './.test-leveldb-' + Date.now();

  beforeEach(async () => {
    backend = new LevelDBStorageBackend(testDbPath);
    await backend.open();
  });

  afterEach(async () => {
    await backend.close();
    // Clean up test database
    try {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should store and retrieve values', async () => {
    await backend.set('key1', 'value1');
    const result = await backend.get('key1');
    expect(result).toBe('value1');
  });

  it('should return null for non-existent keys', async () => {
    const result = await backend.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should delete values', async () => {
    await backend.set('key1', 'value1');
    await backend.delete('key1');
    const result = await backend.get('key1');
    expect(result).toBeNull();
  });

  it('should list keys with prefix', async () => {
    await backend.set('prefix:key1', 'value1');
    await backend.set('prefix:key2', 'value2');
    await backend.set('other:key3', 'value3');

    const keys = await backend.list('prefix:');
    expect(keys).toHaveLength(2);
    expect(keys).toContain('prefix:key1');
    expect(keys).toContain('prefix:key2');
  });

  it('should clear all data', async () => {
    await backend.set('key1', 'value1');
    await backend.set('key2', 'value2');
    await backend.clear();
    
    const keys = await backend.list();
    expect(keys).toHaveLength(0);
  });

  it('should report availability correctly', async () => {
    expect(await backend.isAvailable()).toBe(true);
    await backend.close();
    expect(await backend.isAvailable()).toBe(false);
  });
});


describe('BaseStorage', () => {
  let storage: BaseStorage;
  let backend: MemoryStorageBackend;

  beforeEach(() => {
    backend = new MemoryStorageBackend();
    storage = new BaseStorage(backend);
  });

  afterEach(async () => {
    await storage.clear();
  });

  describe('Identity Storage', () => {
    const testIdentity: EncryptedIdentity = {
      userId: 'user123',
      exportedData: '{"encrypted": "data"}',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it('should save and load identity', async () => {
      await storage.saveIdentity(testIdentity);
      const loaded = await storage.loadIdentity('user123');
      expect(loaded).toEqual(testIdentity);
    });

    it('should set and get default identity', async () => {
      await storage.saveIdentity(testIdentity);
      await storage.setDefaultIdentity('user123');
      
      const defaultId = await storage.getDefaultIdentityId();
      expect(defaultId).toBe('user123');

      const loaded = await storage.loadIdentity();
      expect(loaded).toEqual(testIdentity);
    });

    it('should list identities', async () => {
      await storage.saveIdentity(testIdentity);
      await storage.saveIdentity({ ...testIdentity, userId: 'user456' });
      
      const ids = await storage.listIdentities();
      expect(ids).toHaveLength(2);
      expect(ids).toContain('user123');
      expect(ids).toContain('user456');
    });

    it('should delete identity', async () => {
      await storage.saveIdentity(testIdentity);
      await storage.deleteIdentity('user123');
      
      const loaded = await storage.loadIdentity('user123');
      expect(loaded).toBeNull();
    });
  });

  describe('Conversation Storage', () => {
    const testConversation: StoredConversation = {
      id: 'conv123',
      type: 'direct',
      createdAt: Date.now(),
      members: ['user1', 'user2'],
      encryptedSessionKey: 'abc123',
      nonce: 'def456',
      updatedAt: Date.now(),
    };

    it('should save and load conversation', async () => {
      await storage.saveConversation(testConversation);
      const loaded = await storage.loadConversation('conv123');
      expect(loaded).toEqual(testConversation);
    });

    it('should load all conversations', async () => {
      await storage.saveConversation(testConversation);
      await storage.saveConversation({ ...testConversation, id: 'conv456' });
      
      const conversations = await storage.loadConversations();
      expect(conversations).toHaveLength(2);
    });

    it('should delete conversation', async () => {
      await storage.saveConversation(testConversation);
      await storage.deleteConversation('conv123');
      
      const loaded = await storage.loadConversation('conv123');
      expect(loaded).toBeNull();
    });
  });

  describe('Message Storage', () => {
    const testMessage: StoredMessage = {
      id: 'msg123',
      conversationId: 'conv123',
      senderId: 'user1',
      type: 'TEXT',
      content: 'Hello world',
      timestamp: Date.now(),
      signature: 'sig123',
      verified: true,
      createdAt: Date.now(),
    };

    it('should save and load message', async () => {
      await storage.saveMessage(testMessage);
      const loaded = await storage.loadMessage('conv123', 'msg123');
      expect(loaded).toEqual(testMessage);
    });

    it('should load messages for conversation', async () => {
      await storage.saveMessage(testMessage);
      await storage.saveMessage({ ...testMessage, id: 'msg456' });
      
      const messages = await storage.loadMessages('conv123');
      expect(messages).toHaveLength(2);
    });

    it('should delete message', async () => {
      await storage.saveMessage(testMessage);
      await storage.deleteMessage('conv123', 'msg123');
      
      const loaded = await storage.loadMessage('conv123', 'msg123');
      expect(loaded).toBeNull();
    });
  });

  describe('Revocation', () => {
    it('should mark message as revoked', async () => {
      await storage.markAsRevoked('msg123', {
        revokedBy: 'user1',
        reason: 'test',
        revokedAt: Date.now(),
      });

      expect(await storage.isRevoked('msg123')).toBe(true);
    });

    it('should get revocation info', async () => {
      const info = {
        revokedBy: 'user1',
        reason: 'test reason',
        revokedAt: Date.now(),
      };
      await storage.markAsRevoked('msg123', info);

      const loaded = await storage.getRevocationInfo('msg123');
      expect(loaded).toEqual(info);
    });
  });

  describe('Local Deletion', () => {
    it('should mark message as locally deleted', async () => {
      await storage.markAsLocallyDeleted('msg123');
      expect(await storage.isLocallyDeleted('msg123')).toBe(true);
    });

    it('should undo local deletion', async () => {
      await storage.markAsLocallyDeleted('msg123');
      await storage.undoLocalDelete('msg123');
      expect(await storage.isLocallyDeleted('msg123')).toBe(false);
    });

    it('should exclude locally deleted messages from loadMessages', async () => {
      const testMessage: StoredMessage = {
        id: 'msg123',
        conversationId: 'conv123',
        senderId: 'user1',
        type: 'TEXT',
        content: 'Hello',
        timestamp: Date.now(),
        signature: 'sig',
        verified: true,
        createdAt: Date.now(),
      };

      await storage.saveMessage(testMessage);
      await storage.markAsLocallyDeleted('msg123');

      const messages = await storage.loadMessages('conv123');
      expect(messages).toHaveLength(0);
    });
  });

  describe('Processed Message IDs', () => {
    it('should track processed message IDs', async () => {
      await storage.saveProcessedMessageId('msg123');
      expect(await storage.isMessageProcessed('msg123')).toBe(true);
    });

    it('should return false for unprocessed messages', async () => {
      expect(await storage.isMessageProcessed('unknown')).toBe(false);
    });
  });
});
