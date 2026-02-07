/**
 * Storage module type definitions
 * Defines interfaces for persistent storage across different environments
 */

import type { MessageType } from '../types.js';
import type { ConversationType } from '../conversation/types.js';

/**
 * Low-level storage backend interface
 * Platform-specific implementations (LevelDB, IndexedDB) implement this
 */
export interface StorageBackend {
  /** Get a value by key */
  get(key: string): Promise<string | null>;
  
  /** Set a value by key */
  set(key: string, value: string): Promise<void>;
  
  /** Delete a value by key */
  delete(key: string): Promise<void>;
  
  /** List all keys (optionally with prefix filter) */
  list(prefix?: string): Promise<string[]>;
  
  /** Check if storage is available/initialized */
  isAvailable(): Promise<boolean>;
  
  /** Close/cleanup storage resources */
  close(): Promise<void>;
  
  /** Clear all data (use with caution) */
  clear(): Promise<void>;
}

/**
 * Encrypted identity data for storage
 */
export interface EncryptedIdentity {
  userId: string;
  exportedData: string; // JSON string from Identity.export()
  createdAt: number;
  updatedAt: number;
}

/**
 * Stored conversation with encrypted session key
 */
export interface StoredConversation {
  id: string;
  type: ConversationType;
  name?: string;
  createdAt: number;
  members: string[];
  admins?: string[];
  encryptedSessionKey: string; // hex encoded
  nonce: string; // hex encoded
  updatedAt: number;
}

/**
 * Stored message format
 */
export interface StoredMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  timestamp: number;
  signature: string; // hex encoded
  verified: boolean;
  createdAt: number;
}

/**
 * Message revocation info
 */
export interface RevocationInfo {
  revokedBy: string;
  reason: string;
  revokedAt: number;
}

/**
 * High-level Storage interface as defined in design document
 * Provides unified access to identity, conversation, and message storage
 */
export interface Storage {
  // Identity storage
  saveIdentity(identity: EncryptedIdentity): Promise<void>;
  loadIdentity(userId?: string): Promise<EncryptedIdentity | null>;
  deleteIdentity(userId: string): Promise<void>;
  listIdentities(): Promise<string[]>;
  setDefaultIdentity(userId: string): Promise<void>;
  getDefaultIdentityId(): Promise<string | null>;
  
  // Conversation storage
  saveConversation(conversation: StoredConversation): Promise<void>;
  loadConversation(id: string): Promise<StoredConversation | null>;
  loadConversations(): Promise<StoredConversation[]>;
  deleteConversation(id: string): Promise<void>;
  
  // Message storage
  saveMessage(message: StoredMessage): Promise<void>;
  loadMessages(conversationId: string, limit?: number): Promise<StoredMessage[]>;
  loadMessage(conversationId: string, messageId: string): Promise<StoredMessage | null>;
  deleteMessage(conversationId: string, messageId: string): Promise<void>;
  markAsRevoked(messageId: string, info: RevocationInfo): Promise<void>;
  isRevoked(messageId: string): Promise<boolean>;
  getRevocationInfo(messageId: string): Promise<RevocationInfo | null>;
  
  // Local deletion tracking (soft delete)
  markAsLocallyDeleted(messageId: string): Promise<void>;
  isLocallyDeleted(messageId: string): Promise<boolean>;
  undoLocalDelete(messageId: string): Promise<void>;
  
  // Processed message IDs (for deduplication)
  saveProcessedMessageId(messageId: string): Promise<void>;
  isMessageProcessed(messageId: string): Promise<boolean>;
  
  // Lifecycle
  close(): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Storage configuration options
 */
export interface StorageConfig {
  /** Storage path for file-based backends (Node.js) */
  path?: string;
  
  /** Database name for browser storage */
  dbName?: string;
  
  /** TTL for processed message IDs cache (ms) */
  processedMessageTTL?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_STORAGE_CONFIG: Required<StorageConfig> = {
  path: './.waku-chat-data',
  dbName: 'waku-encrypted-chat',
  processedMessageTTL: 24 * 60 * 60 * 1000, // 24 hours
};
