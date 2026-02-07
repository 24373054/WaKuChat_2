/**
 * IndexedDB storage backend for browser environment
 * Provides persistent key-value storage using IndexedDB
 */

import type { StorageBackend } from './types.js';

const STORE_NAME = 'keyvalue';
const DB_VERSION = 1;

/**
 * IndexedDB implementation of StorageBackend
 * Suitable for browser environments requiring persistent storage
 */
export class IndexedDBStorageBackend implements StorageBackend {
  private dbName: string;
  private db: IDBDatabase | null = null;

  /**
   * Create a new IndexedDB storage backend
   * @param dbName - Name of the IndexedDB database
   */
  constructor(dbName: string = 'waku-encrypted-chat') {
    this.dbName = dbName;
  }

  /**
   * Open the database connection
   * Must be called before using other methods
   */
  async open(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  async get(key: string): Promise<string | null> {
    await this.ensureOpen();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => {
        reject(new Error(`Failed to get key: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result ?? null);
      };
    });
  }


  async set(key: string, value: string): Promise<void> {
    await this.ensureOpen();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onerror = () => {
        reject(new Error(`Failed to set key: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async delete(key: string): Promise<void> {
    await this.ensureOpen();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onerror = () => {
        reject(new Error(`Failed to delete key: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async list(prefix?: string): Promise<string[]> {
    await this.ensureOpen();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onerror = () => {
        reject(new Error(`Failed to list keys: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        let keys = request.result as string[];
        
        if (prefix) {
          keys = keys.filter(key => key.startsWith(prefix));
        }
        
        resolve(keys);
      };
    });
  }

  async isAvailable(): Promise<boolean> {
    return this.db !== null;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async clear(): Promise<void> {
    await this.ensureOpen();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => {
        reject(new Error(`Failed to clear store: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Get the database name
   */
  getDbName(): string {
    return this.dbName;
  }

  /**
   * Delete the entire database
   * Use with caution - this removes all data
   */
  async deleteDatabase(): Promise<void> {
    await this.close();

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);

      request.onerror = () => {
        reject(new Error(`Failed to delete database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Ensure the database is open
   */
  private async ensureOpen(): Promise<void> {
    if (!this.db) {
      await this.open();
    }
  }
}

/**
 * Create an IndexedDB storage backend with automatic initialization
 * @param dbName - Name of the IndexedDB database
 */
export async function createIndexedDBBackend(dbName?: string): Promise<IndexedDBStorageBackend> {
  const backend = new IndexedDBStorageBackend(dbName);
  await backend.open();
  return backend;
}

/**
 * Check if IndexedDB is available in the current environment
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
