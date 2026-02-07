/**
 * ChatClient unit tests
 * Tests the ChatClient class functionality without network dependencies
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageBackend } from '../identity/storage.js';
import { generateKeyPair } from '../crypto/index.js';
import { Identity } from '../identity/identity.js';

// Note: Full ChatClient tests require Waku network dependencies
// These tests focus on the non-network functionality

describe('ChatClient Dependencies', () => {
  describe('Identity', () => {
    it('should create a new identity', () => {
      const identity = Identity.create();
      
      expect(identity).toBeDefined();
      expect(identity.userId).toBeDefined();
      expect(identity.userId.length).toBeGreaterThan(0);
      expect(identity.publicKey).toBeInstanceOf(Uint8Array);
      expect(identity.privateKey).toBeInstanceOf(Uint8Array);
    });

    it('should export and import identity', async () => {
      const identity = Identity.create();
      const password = 'test-password-123';
      
      const exported = await identity.export(password);
      
      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');
      
      // Parse to verify it's valid JSON
      const parsed = JSON.parse(exported);
      expect(parsed.version).toBe(1);
      expect(parsed.userId).toBe(identity.userId);
      
      // Import the identity
      const imported = await Identity.import(exported, password);
      
      expect(imported.userId).toBe(identity.userId);
      expect(imported.publicKey).toEqual(identity.publicKey);
    });

    it('should fail to import with wrong password', async () => {
      const identity = Identity.create();
      const exported = await identity.export('correct-password');
      
      // Wrong password should fail
      await expect(Identity.import(exported, 'wrong-password')).rejects.toThrow();
    });

    it('should sign and verify data', async () => {
      const identity = Identity.create();
      const data = new TextEncoder().encode('Hello, World!');
      
      const signature = await identity.sign(data);
      
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64); // ECDSA signature
      
      const isValid = identity.verify(data, signature, identity.publicKey);
      expect(isValid).toBe(true);
    });

    it('should derive shared secret', () => {
      const alice = Identity.create();
      const bob = Identity.create();
      
      const aliceShared = alice.deriveSharedSecret(bob.publicKey);
      const bobShared = bob.deriveSharedSecret(alice.publicKey);
      
      expect(aliceShared).toEqual(bobShared);
    });
  });

  describe('Storage Backend', () => {
    let storage: InMemoryStorageBackend;

    beforeEach(() => {
      storage = new InMemoryStorageBackend();
    });

    it('should store and retrieve data', async () => {
      await storage.set('key1', 'value1');
      const value = await storage.get('key1');
      expect(value).toBe('value1');
    });

    it('should return null for non-existent keys', async () => {
      const value = await storage.get('non-existent');
      expect(value).toBeNull();
    });

    it('should delete data', async () => {
      await storage.set('key1', 'value1');
      await storage.delete('key1');
      const value = await storage.get('key1');
      expect(value).toBeNull();
    });

    it('should list all keys', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.set('key3', 'value3');
      
      const keys = await storage.list();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    it('should clear all data', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.clear();
      
      const keys = await storage.list();
      expect(keys).toHaveLength(0);
    });
  });

  describe('Key Generation', () => {
    it('should generate valid key pairs', () => {
      const keyPair = generateKeyPair();
      
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey.length).toBe(32);
      expect(keyPair.publicKey.length).toBe(33); // Compressed
    });

    it('should generate unique key pairs', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();
      
      expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
    });
  });
});
