/**
 * In-memory storage backend
 * Useful for testing and simple use cases where persistence is not required
 */

import type { StorageBackend } from './types.js';

/**
 * In-memory implementation of StorageBackend
 * Data is lost when the process exits
 */
export class MemoryStorageBackend implements StorageBackend {
  private store: Map<string, string> = new Map();
  private available = true;

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = Array.from(this.store.keys());
    if (prefix) {
      return keys.filter(key => key.startsWith(prefix));
    }
    return keys;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async close(): Promise<void> {
    this.available = false;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /**
   * Get the number of stored items (for testing)
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Check if a key exists (for testing)
   */
  has(key: string): boolean {
    return this.store.has(key);
  }
}
