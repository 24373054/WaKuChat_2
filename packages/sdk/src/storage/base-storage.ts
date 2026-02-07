/**
 * Base storage implementation using StorageBackend
 * Provides the high-level Storage interface on top of any StorageBackend
 */

import type {
  Storage,
  StorageBackend,
  StorageConfig,
  EncryptedIdentity,
  StoredConversation,
  StoredMessage,
  RevocationInfo,
} from './types.js';
import { DEFAULT_STORAGE_CONFIG } from './types.js';

// Storage key prefixes
const IDENTITY_PREFIX = 'identity:';
const CONVERSATION_PREFIX = 'conversation:';
const MESSAGE_PREFIX = 'message:';
const REVOKED_PREFIX = 'revoked:';
const DELETED_PREFIX = 'deleted:';
const PROCESSED_PREFIX = 'processed:';
const DEFAULT_IDENTITY_KEY = 'default_identity';

/**
 * Base storage implementation
 * Wraps a StorageBackend to provide the full Storage interface
 */
export class BaseStorage implements Storage {
  protected backend: StorageBackend;
  protected config: Required<StorageConfig>;

  constructor(backend: StorageBackend, config: StorageConfig = {}) {
    this.backend = backend;
    this.config = { ...DEFAULT_STORAGE_CONFIG, ...config };
  }

  // ============ Identity Storage ============

  async saveIdentity(identity: EncryptedIdentity): Promise<void> {
    const key = `${IDENTITY_PREFIX}${identity.userId}`;
    await this.backend.set(key, JSON.stringify(identity));
  }

  async loadIdentity(userId?: string): Promise<EncryptedIdentity | null> {
    let targetUserId: string | null | undefined = userId;
    
    if (!targetUserId) {
      targetUserId = await this.getDefaultIdentityId();
      if (!targetUserId) return null;
    }

    const key = `${IDENTITY_PREFIX}${targetUserId}`;
    const data = await this.backend.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteIdentity(userId: string): Promise<void> {
    const key = `${IDENTITY_PREFIX}${userId}`;
    await this.backend.delete(key);

    // Clear default if this was the default identity
    const defaultId = await this.getDefaultIdentityId();
    if (defaultId === userId) {
      await this.backend.delete(DEFAULT_IDENTITY_KEY);
    }
  }


  async listIdentities(): Promise<string[]> {
    const keys = await this.backend.list(IDENTITY_PREFIX);
    return keys.map(key => key.slice(IDENTITY_PREFIX.length));
  }

  async setDefaultIdentity(userId: string): Promise<void> {
    const identity = await this.loadIdentity(userId);
    if (!identity) {
      throw new Error(`Identity not found: ${userId}`);
    }
    await this.backend.set(DEFAULT_IDENTITY_KEY, userId);
  }

  async getDefaultIdentityId(): Promise<string | null> {
    return this.backend.get(DEFAULT_IDENTITY_KEY);
  }

  // ============ Conversation Storage ============

  async saveConversation(conversation: StoredConversation): Promise<void> {
    const key = `${CONVERSATION_PREFIX}${conversation.id}`;
    await this.backend.set(key, JSON.stringify(conversation));
  }

  async loadConversation(id: string): Promise<StoredConversation | null> {
    const key = `${CONVERSATION_PREFIX}${id}`;
    const data = await this.backend.get(key);
    return data ? JSON.parse(data) : null;
  }

  async loadConversations(): Promise<StoredConversation[]> {
    const keys = await this.backend.list(CONVERSATION_PREFIX);
    const conversations: StoredConversation[] = [];

    for (const key of keys) {
      const data = await this.backend.get(key);
      if (data) {
        conversations.push(JSON.parse(data));
      }
    }

    return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async deleteConversation(id: string): Promise<void> {
    const key = `${CONVERSATION_PREFIX}${id}`;
    await this.backend.delete(key);
  }

  // ============ Message Storage ============

  async saveMessage(message: StoredMessage): Promise<void> {
    const key = this.getMessageKey(message.conversationId, message.id);
    await this.backend.set(key, JSON.stringify(message));
  }

  async loadMessage(conversationId: string, messageId: string): Promise<StoredMessage | null> {
    const key = this.getMessageKey(conversationId, messageId);
    const data = await this.backend.get(key);
    return data ? JSON.parse(data) : null;
  }

  async loadMessages(conversationId: string, limit?: number): Promise<StoredMessage[]> {
    const prefix = `${MESSAGE_PREFIX}${conversationId}:`;
    const keys = await this.backend.list(prefix);
    
    const messages: StoredMessage[] = [];
    const sortedKeys = keys.sort().reverse(); // Most recent first

    for (const key of sortedKeys) {
      if (limit && messages.length >= limit) break;

      const messageId = key.slice(prefix.length);
      
      // Skip locally deleted messages
      if (await this.isLocallyDeleted(messageId)) continue;

      const data = await this.backend.get(key);
      if (data) {
        messages.push(JSON.parse(data));
      }
    }

    return messages;
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    const key = this.getMessageKey(conversationId, messageId);
    await this.backend.delete(key);
    
    // Clean up related markers
    await this.backend.delete(`${DELETED_PREFIX}${messageId}`);
    await this.backend.delete(`${REVOKED_PREFIX}${messageId}`);
  }

  // ============ Revocation ============

  async markAsRevoked(messageId: string, info: RevocationInfo): Promise<void> {
    const key = `${REVOKED_PREFIX}${messageId}`;
    await this.backend.set(key, JSON.stringify(info));
  }

  async isRevoked(messageId: string): Promise<boolean> {
    const key = `${REVOKED_PREFIX}${messageId}`;
    const data = await this.backend.get(key);
    return data !== null;
  }

  async getRevocationInfo(messageId: string): Promise<RevocationInfo | null> {
    const key = `${REVOKED_PREFIX}${messageId}`;
    const data = await this.backend.get(key);
    return data ? JSON.parse(data) : null;
  }

  // ============ Local Deletion ============

  async markAsLocallyDeleted(messageId: string): Promise<void> {
    const key = `${DELETED_PREFIX}${messageId}`;
    await this.backend.set(key, JSON.stringify({ deletedAt: Date.now() }));
  }

  async isLocallyDeleted(messageId: string): Promise<boolean> {
    const key = `${DELETED_PREFIX}${messageId}`;
    const data = await this.backend.get(key);
    return data !== null;
  }

  async undoLocalDelete(messageId: string): Promise<void> {
    const key = `${DELETED_PREFIX}${messageId}`;
    await this.backend.delete(key);
  }

  // ============ Processed Message IDs ============

  async saveProcessedMessageId(messageId: string): Promise<void> {
    const key = `${PROCESSED_PREFIX}${messageId}`;
    await this.backend.set(key, JSON.stringify({ 
      processedAt: Date.now(),
      expiresAt: Date.now() + this.config.processedMessageTTL 
    }));
  }

  async isMessageProcessed(messageId: string): Promise<boolean> {
    const key = `${PROCESSED_PREFIX}${messageId}`;
    const data = await this.backend.get(key);
    
    if (!data) return false;

    const { expiresAt } = JSON.parse(data);
    if (Date.now() > expiresAt) {
      // Expired, clean up and return false
      await this.backend.delete(key);
      return false;
    }

    return true;
  }

  // ============ Lifecycle ============

  async close(): Promise<void> {
    await this.backend.close();
  }

  async clear(): Promise<void> {
    await this.backend.clear();
  }

  // ============ Helpers ============

  private getMessageKey(conversationId: string, messageId: string): string {
    return `${MESSAGE_PREFIX}${conversationId}:${messageId}`;
  }
}
