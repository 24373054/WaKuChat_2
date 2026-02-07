/**
 * Identity module exports
 */

export { Identity, type IdentityData, type ExportedIdentity } from './identity.js';
export { 
  IdentityStorage, 
  InMemoryStorageBackend,
  type StoredIdentity, 
  type StorageBackend 
} from './storage.js';
