/**
 * Identity storage module for persisting encrypted identities
 * Provides an abstract interface with in-memory implementation
 * Platform-specific implementations (LevelDB, IndexedDB) can extend this
 */

import { Identity } from './identity.js';

export interface StoredIdentity {
  userId: string;
  exportedData: string; // JSON string from Identity.export()
  createdAt: number;
  updatedAt: number;
}

export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

/**
 * In-memory storage backend for testing and simple use cases
 */
export class InMemoryStorageBackend implements StorageBackend {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  clear(): void {
    this.store.clear();
  }
}

const IDENTITY_PREFIX = 'identity:';
const DEFAULT_IDENTITY_KEY = 'default_identity';


/**
 * Identity storage manager
 * Handles saving, loading, and managing encrypted identities
 */
export class IdentityStorage {
  private backend: StorageBackend;

  constructor(backend?: StorageBackend) {
    this.backend = backend ?? new InMemoryStorageBackend();
  }

  /**
   * Save an identity with encryption
   * @param identity - Identity to save
   * @param password - Password to encrypt the private key
   * @param isDefault - Whether to set as default identity
   */
  async save(identity: Identity, password: string, isDefault = true): Promise<void> {
    const exportedData = await identity.export(password);
    
    const stored: StoredIdentity = {
      userId: identity.userId,
      exportedData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const key = `${IDENTITY_PREFIX}${identity.userId}`;
    await this.backend.set(key, JSON.stringify(stored));

    if (isDefault) {
      await this.backend.set(DEFAULT_IDENTITY_KEY, identity.userId);
    }
  }

  /**
   * Load an identity by userId
   * @param userId - User ID to load
   * @param password - Password to decrypt the private key
   */
  async load(userId: string, password: string): Promise<Identity> {
    const key = `${IDENTITY_PREFIX}${userId}`;
    const data = await this.backend.get(key);

    if (!data) {
      throw new Error(`Identity not found: ${userId}`);
    }

    const stored: StoredIdentity = JSON.parse(data);
    return Identity.import(stored.exportedData, password);
  }

  /**
   * Load the default identity
   * @param password - Password to decrypt the private key
   */
  async loadDefault(password: string): Promise<Identity> {
    const defaultUserId = await this.backend.get(DEFAULT_IDENTITY_KEY);

    if (!defaultUserId) {
      throw new Error('No default identity set');
    }

    return this.load(defaultUserId, password);
  }

  /**
   * Check if an identity exists
   */
  async exists(userId: string): Promise<boolean> {
    const key = `${IDENTITY_PREFIX}${userId}`;
    const data = await this.backend.get(key);
    return data !== null;
  }

  /**
   * Check if a default identity is set
   */
  async hasDefault(): Promise<boolean> {
    const defaultUserId = await this.backend.get(DEFAULT_IDENTITY_KEY);
    return defaultUserId !== null;
  }

  /**
   * Get the default identity's userId
   */
  async getDefaultUserId(): Promise<string | null> {
    return this.backend.get(DEFAULT_IDENTITY_KEY);
  }

  /**
   * Set the default identity
   */
  async setDefault(userId: string): Promise<void> {
    if (!(await this.exists(userId))) {
      throw new Error(`Identity not found: ${userId}`);
    }
    await this.backend.set(DEFAULT_IDENTITY_KEY, userId);
  }


  /**
   * Delete an identity
   */
  async delete(userId: string): Promise<void> {
    const key = `${IDENTITY_PREFIX}${userId}`;
    await this.backend.delete(key);

    // Clear default if this was the default identity
    const defaultUserId = await this.backend.get(DEFAULT_IDENTITY_KEY);
    if (defaultUserId === userId) {
      await this.backend.delete(DEFAULT_IDENTITY_KEY);
    }
  }

  /**
   * List all stored identity userIds
   */
  async list(): Promise<string[]> {
    const keys = await this.backend.list();
    return keys
      .filter(key => key.startsWith(IDENTITY_PREFIX))
      .map(key => key.slice(IDENTITY_PREFIX.length));
  }

  /**
   * Get stored identity metadata (without decrypting)
   */
  async getMetadata(userId: string): Promise<Omit<StoredIdentity, 'exportedData'> | null> {
    const key = `${IDENTITY_PREFIX}${userId}`;
    const data = await this.backend.get(key);

    if (!data) {
      return null;
    }

    const stored: StoredIdentity = JSON.parse(data);
    return {
      userId: stored.userId,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
  }

  /**
   * Update the password for a stored identity
   * @param userId - User ID to update
   * @param oldPassword - Current password
   * @param newPassword - New password
   */
  async updatePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    // Load with old password
    const identity = await this.load(userId, oldPassword);
    
    // Get existing metadata
    const key = `${IDENTITY_PREFIX}${userId}`;
    const data = await this.backend.get(key);
    if (!data) {
      throw new Error(`Identity not found: ${userId}`);
    }
    const stored: StoredIdentity = JSON.parse(data);

    // Re-export with new password
    const exportedData = await identity.export(newPassword);
    
    const updated: StoredIdentity = {
      ...stored,
      exportedData,
      updatedAt: Date.now(),
    };

    await this.backend.set(key, JSON.stringify(updated));
  }
}
