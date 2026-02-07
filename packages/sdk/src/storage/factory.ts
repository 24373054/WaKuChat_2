/**
 * Storage factory for automatic environment detection
 * Selects the appropriate storage backend based on the runtime environment
 */

import type { StorageBackend, StorageConfig, Storage } from './types.js';
import { DEFAULT_STORAGE_CONFIG } from './types.js';
import { BaseStorage } from './base-storage.js';
import { MemoryStorageBackend } from './memory-backend.js';

/**
 * Detect the current runtime environment
 */
export type RuntimeEnvironment = 'node' | 'browser' | 'unknown';

export function detectEnvironment(): RuntimeEnvironment {
  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }
  
  // Check for browser
  if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
    return 'browser';
  }
  
  return 'unknown';
}

/**
 * Create a storage backend appropriate for the current environment
 * 
 * - Node.js: Uses LevelDB for persistent storage
 * - Browser: Uses IndexedDB for persistent storage
 * - Unknown: Falls back to in-memory storage
 * 
 * @param config - Storage configuration options
 */
export async function createStorageBackend(config: StorageConfig = {}): Promise<StorageBackend> {
  const mergedConfig = { ...DEFAULT_STORAGE_CONFIG, ...config };
  const env = detectEnvironment();

  switch (env) {
    case 'node': {
      // Dynamically import LevelDB backend for Node.js
      const { LevelDBStorageBackend } = await import('./leveldb-backend.js');
      const backend = new LevelDBStorageBackend(mergedConfig.path);
      await backend.open();
      return backend;
    }
    
    case 'browser': {
      // Dynamically import IndexedDB backend for browser
      const { IndexedDBStorageBackend } = await import('./indexeddb-backend.js');
      const backend = new IndexedDBStorageBackend(mergedConfig.dbName);
      await backend.open();
      return backend;
    }
    
    default: {
      // Fall back to in-memory storage
      console.warn('Unknown environment, using in-memory storage (data will not persist)');
      return new MemoryStorageBackend();
    }
  }
}

/**
 * Create a full Storage instance with automatic environment detection
 * 
 * @param config - Storage configuration options
 */
export async function createStorage(config: StorageConfig = {}): Promise<Storage> {
  const backend = await createStorageBackend(config);
  return new BaseStorage(backend, config);
}

/**
 * Create storage with a specific backend type
 * Useful when you want to explicitly choose the storage type
 */
export async function createStorageWithBackend(
  backendType: 'memory' | 'leveldb' | 'indexeddb',
  config: StorageConfig = {}
): Promise<Storage> {
  const mergedConfig = { ...DEFAULT_STORAGE_CONFIG, ...config };
  let backend: StorageBackend;

  switch (backendType) {
    case 'memory':
      backend = new MemoryStorageBackend();
      break;
      
    case 'leveldb': {
      const { LevelDBStorageBackend } = await import('./leveldb-backend.js');
      const levelBackend = new LevelDBStorageBackend(mergedConfig.path);
      await levelBackend.open();
      backend = levelBackend;
      break;
    }
    
    case 'indexeddb': {
      const { IndexedDBStorageBackend } = await import('./indexeddb-backend.js');
      const idbBackend = new IndexedDBStorageBackend(mergedConfig.dbName);
      await idbBackend.open();
      backend = idbBackend;
      break;
    }
    
    default:
      throw new Error(`Unknown backend type: ${backendType}`);
  }

  return new BaseStorage(backend, config);
}
