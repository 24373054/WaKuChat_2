/**
 * LevelDB storage backend for Node.js environment
 * Provides persistent key-value storage using LevelDB
 */

import { Level } from 'level';
import type { StorageBackend } from './types.js';

/**
 * LevelDB implementation of StorageBackend
 * Suitable for Node.js environments requiring persistent storage
 */
export class LevelDBStorageBackend implements StorageBackend {
  private db: Level<string, string>;
  private dbPath: string;
  private isOpen = false;

  /**
   * Create a new LevelDB storage backend
   * @param path - Path to the LevelDB database directory
   */
  constructor(path: string) {
    this.dbPath = path;
    this.db = new Level(path, { valueEncoding: 'utf8' });
  }

  /**
   * Open the database connection
   * Must be called before using other methods
   */
  async open(): Promise<void> {
    if (this.isOpen) return;
    
    await this.db.open();
    this.isOpen = true;
  }

  async get(key: string): Promise<string | null> {
    await this.ensureOpen();
    
    try {
      const value = await this.db.get(key);
      // Ensure we return null instead of undefined
      return value ?? null;
    } catch (error: unknown) {
      // LevelDB throws LEVEL_NOT_FOUND error when key doesn't exist
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureOpen();
    await this.db.put(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.ensureOpen();
    
    try {
      await this.db.del(key);
    } catch (error: unknown) {
      // Ignore not found errors on delete
      if (!this.isNotFoundError(error)) {
        throw error;
      }
    }
  }


  async list(prefix?: string): Promise<string[]> {
    await this.ensureOpen();
    
    const keys: string[] = [];
    
    const options = prefix 
      ? { gte: prefix, lt: prefix + '\xFF' }
      : {};

    for await (const key of this.db.keys(options)) {
      keys.push(key);
    }

    return keys;
  }

  async isAvailable(): Promise<boolean> {
    return this.isOpen && this.db.status === 'open';
  }

  async close(): Promise<void> {
    if (this.isOpen && this.db.status === 'open') {
      await this.db.close();
      this.isOpen = false;
    }
  }

  async clear(): Promise<void> {
    await this.ensureOpen();
    await this.db.clear();
  }

  /**
   * Get the database path
   */
  getPath(): string {
    return this.dbPath;
  }

  /**
   * Get database status
   */
  getStatus(): string {
    return this.db.status;
  }

  /**
   * Ensure the database is open
   */
  private async ensureOpen(): Promise<void> {
    if (!this.isOpen || this.db.status !== 'open') {
      await this.open();
    }
  }

  /**
   * Check if an error is a "not found" error
   */
  private isNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as { code?: string; notFound?: boolean };
      return err.code === 'LEVEL_NOT_FOUND' || err.notFound === true;
    }
    return false;
  }
}

/**
 * Create a LevelDB storage backend with automatic initialization
 * @param path - Path to the LevelDB database directory
 */
export async function createLevelDBBackend(path: string): Promise<LevelDBStorageBackend> {
  const backend = new LevelDBStorageBackend(path);
  await backend.open();
  return backend;
}
