/**
 * Storage module exports
 * Provides unified storage interface and implementations
 */

// Types - use specific names to avoid conflicts with existing module exports
export type {
  Storage,
  StorageBackend as UnifiedStorageBackend,
  StorageConfig,
  EncryptedIdentity,
  StoredConversation as UnifiedStoredConversation,
  StoredMessage as UnifiedStoredMessage,
  RevocationInfo,
} from './types.js';

export { DEFAULT_STORAGE_CONFIG } from './types.js';

// Implementations
export { BaseStorage } from './base-storage.js';
export { MemoryStorageBackend } from './memory-backend.js';

// Platform-specific backends
export { LevelDBStorageBackend, createLevelDBBackend } from './leveldb-backend.js';
export { 
  IndexedDBStorageBackend, 
  createIndexedDBBackend, 
  isIndexedDBAvailable 
} from './indexeddb-backend.js';

// Factory functions for automatic environment detection
export {
  createStorage,
  createStorageBackend,
  createStorageWithBackend,
  detectEnvironment,
  type RuntimeEnvironment,
} from './factory.js';
