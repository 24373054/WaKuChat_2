/**
 * Identity module tests
 * Tests for Identity class and IdentityStorage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Identity } from './identity.js';
import { IdentityStorage, InMemoryStorageBackend } from './storage.js';

describe('Identity', () => {
  describe('create', () => {
    it('should create a new identity with valid keys', () => {
      const identity = Identity.create();
      
      expect(identity.userId).toBeDefined();
      expect(identity.userId.length).toBe(40); // 20 bytes hex = 40 chars
      expect(identity.publicKey).toBeInstanceOf(Uint8Array);
      expect(identity.publicKey.length).toBe(33); // compressed secp256k1
      expect(identity.privateKey).toBeInstanceOf(Uint8Array);
      expect(identity.privateKey.length).toBe(32);
    });

    it('should create unique identities', () => {
      const identity1 = Identity.create();
      const identity2 = Identity.create();
      
      expect(identity1.userId).not.toBe(identity2.userId);
    });
  });

  describe('export/import', () => {
    it('should export and import identity with password', async () => {
      const original = Identity.create();
      const password = 'test-password-123';
      
      const exported = await original.export(password);
      expect(typeof exported).toBe('string');
      
      const imported = await Identity.import(exported, password);
      
      expect(imported.userId).toBe(original.userId);
      expect(Array.from(imported.publicKey)).toEqual(Array.from(original.publicKey));
      expect(Array.from(imported.privateKey)).toEqual(Array.from(original.privateKey));
    });

    it('should fail import with wrong password', async () => {
      const identity = Identity.create();
      const exported = await identity.export('correct-password');
      
      await expect(Identity.import(exported, 'wrong-password')).rejects.toThrow();
    });
  });


  describe('sign/verify', () => {
    it('should sign and verify data', async () => {
      const identity = Identity.create();
      const data = new TextEncoder().encode('test message');
      
      const signature = await identity.sign(data);
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64); // compact signature
      
      const isValid = identity.verify(data, signature, identity.publicKey);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', async () => {
      const identity1 = Identity.create();
      const identity2 = Identity.create();
      const data = new TextEncoder().encode('test message');
      
      const signature = await identity1.sign(data);
      const isValid = identity2.verify(data, signature, identity1.publicKey);
      expect(isValid).toBe(true);
      
      // Verify with wrong public key should fail
      const isInvalid = identity2.verify(data, signature, identity2.publicKey);
      expect(isInvalid).toBe(false);
    });
  });

  describe('deriveSharedSecret', () => {
    it('should derive symmetric shared secrets', () => {
      const alice = Identity.create();
      const bob = Identity.create();
      
      const aliceShared = alice.deriveSharedSecret(bob.publicKey);
      const bobShared = bob.deriveSharedSecret(alice.publicKey);
      
      expect(Array.from(aliceShared)).toEqual(Array.from(bobShared));
    });
  });

  describe('fromPrivateKey', () => {
    it('should create identity from existing private key', () => {
      const original = Identity.create();
      const restored = Identity.fromPrivateKey(original.privateKey);
      
      expect(restored.userId).toBe(original.userId);
      expect(Array.from(restored.publicKey)).toEqual(Array.from(original.publicKey));
    });
  });
});

describe('IdentityStorage', () => {
  let storage: IdentityStorage;
  let backend: InMemoryStorageBackend;

  beforeEach(() => {
    backend = new InMemoryStorageBackend();
    storage = new IdentityStorage(backend);
  });

  describe('save/load', () => {
    it('should save and load identity', async () => {
      const identity = Identity.create();
      const password = 'storage-password';
      
      await storage.save(identity, password);
      const loaded = await storage.load(identity.userId, password);
      
      expect(loaded.userId).toBe(identity.userId);
      expect(Array.from(loaded.publicKey)).toEqual(Array.from(identity.publicKey));
    });

    it('should set default identity on save', async () => {
      const identity = Identity.create();
      await storage.save(identity, 'password');
      
      expect(await storage.hasDefault()).toBe(true);
      expect(await storage.getDefaultUserId()).toBe(identity.userId);
    });

    it('should load default identity', async () => {
      const identity = Identity.create();
      const password = 'password';
      await storage.save(identity, password);
      
      const loaded = await storage.loadDefault(password);
      expect(loaded.userId).toBe(identity.userId);
    });
  });

  describe('exists/list', () => {
    it('should check if identity exists', async () => {
      const identity = Identity.create();
      
      expect(await storage.exists(identity.userId)).toBe(false);
      await storage.save(identity, 'password');
      expect(await storage.exists(identity.userId)).toBe(true);
    });

    it('should list all stored identities', async () => {
      const identity1 = Identity.create();
      const identity2 = Identity.create();
      
      await storage.save(identity1, 'password', false);
      await storage.save(identity2, 'password', false);
      
      const list = await storage.list();
      expect(list).toContain(identity1.userId);
      expect(list).toContain(identity2.userId);
      expect(list.length).toBe(2);
    });
  });

  describe('delete', () => {
    it('should delete identity', async () => {
      const identity = Identity.create();
      await storage.save(identity, 'password');
      
      await storage.delete(identity.userId);
      
      expect(await storage.exists(identity.userId)).toBe(false);
      expect(await storage.hasDefault()).toBe(false);
    });
  });

  describe('updatePassword', () => {
    it('should update password for stored identity', async () => {
      const identity = Identity.create();
      const oldPassword = 'old-password';
      const newPassword = 'new-password';
      
      await storage.save(identity, oldPassword);
      await storage.updatePassword(identity.userId, oldPassword, newPassword);
      
      // Old password should fail
      await expect(storage.load(identity.userId, oldPassword)).rejects.toThrow();
      
      // New password should work
      const loaded = await storage.load(identity.userId, newPassword);
      expect(loaded.userId).toBe(identity.userId);
    });
  });
});
