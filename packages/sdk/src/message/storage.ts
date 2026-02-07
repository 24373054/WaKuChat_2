/**
 * Message storage module for persisting messages locally
 * Handles message storage, local deletion, and revocation status
 */

import type { StorageBackend } from '../identity/storage.js';
import type { Message, MessageType } from '../types.js';

const MESSAGE_PREFIX = 'message:';
const REVOKED_PREFIX = 'revoked:';
const DELETED_PREFIX = 'deleted:';

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
 * Message storage manager
 * Handles local message persistence, deletion, and revocation tracking
 */
export class MessageStorage {
  private backend: StorageBackend;

  constructor(backend: StorageBackend) {
    this.backend = backend;
  }

  /**
   * Save a message to local storage
   */
  async saveMessage(message: Message): Promise<void> {
    const stored: StoredMessage = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      type: message.type,
      content: message.content,
      timestamp: message.timestamp,
      signature: this.bytesToHex(message.signature),
      verified: message.verified,
      createdAt: Date.now(),
    };

    const key = this.getMessageKey(message.conversationId, message.id);
    await this.backend.set(key, JSON.stringify(stored));
  }

  /**
   * Load a message by ID
   */
  async loadMessage(conversationId: string, messageId: string): Promise<Message | null> {
    // Check if locally deleted
    if (await this.isLocallyDeleted(messageId)) {
      return null;
    }

    const key = this.getMessageKey(conversationId, messageId);
    const data = await this.backend.get(key);

    if (!data) {
      return null;
    }

    const stored: StoredMessage = JSON.parse(data);
    const isRevoked = await this.isRevoked(messageId);

    return {
      id: stored.id,
      conversationId: stored.conversationId,
      senderId: stored.senderId,
      type: stored.type,
      content: stored.content,
      timestamp: stored.timestamp,
      status: isRevoked ? 'revoked' : 'sent',
      signature: this.hexToBytes(stored.signature),
      verified: stored.verified,
    };
  }


  /**
   * Load all messages for a conversation
   * Excludes locally deleted messages and marks revoked messages
   */
  async loadMessages(conversationId: string, limit?: number): Promise<Message[]> {
    const keys = await this.backend.list();
    const prefix = `${MESSAGE_PREFIX}${conversationId}:`;
    
    const messageKeys = keys
      .filter(key => key.startsWith(prefix))
      .sort()
      .reverse(); // Most recent first

    const messages: Message[] = [];
    
    for (const key of messageKeys) {
      if (limit && messages.length >= limit) {
        break;
      }

      const messageId = key.slice(prefix.length);
      
      // Skip locally deleted messages
      if (await this.isLocallyDeleted(messageId)) {
        continue;
      }

      const data = await this.backend.get(key);
      if (!data) continue;

      const stored: StoredMessage = JSON.parse(data);
      const isRevoked = await this.isRevoked(messageId);

      messages.push({
        id: stored.id,
        conversationId: stored.conversationId,
        senderId: stored.senderId,
        type: stored.type,
        content: stored.content,
        timestamp: stored.timestamp,
        status: isRevoked ? 'revoked' : 'sent',
        signature: this.hexToBytes(stored.signature),
        verified: stored.verified,
      });
    }

    return messages;
  }

  /**
   * Delete a message locally (only affects local storage)
   * The message is marked as deleted but not removed from storage
   * This allows the deletion to be undone if needed
   */
  async deleteLocalMessage(messageId: string): Promise<void> {
    const key = `${DELETED_PREFIX}${messageId}`;
    await this.backend.set(key, JSON.stringify({ deletedAt: Date.now() }));
  }

  /**
   * Check if a message is locally deleted
   */
  async isLocallyDeleted(messageId: string): Promise<boolean> {
    const key = `${DELETED_PREFIX}${messageId}`;
    const data = await this.backend.get(key);
    return data !== null;
  }

  /**
   * Undo local deletion of a message
   */
  async undoLocalDelete(messageId: string): Promise<void> {
    const key = `${DELETED_PREFIX}${messageId}`;
    await this.backend.delete(key);
  }

  /**
   * Mark a message as revoked
   * This is called when receiving a revoke control message
   */
  async markAsRevoked(messageId: string, revokedBy: string, reason?: string): Promise<void> {
    const key = `${REVOKED_PREFIX}${messageId}`;
    await this.backend.set(key, JSON.stringify({
      revokedBy,
      reason: reason ?? '',
      revokedAt: Date.now(),
    }));
  }

  /**
   * Check if a message is revoked
   */
  async isRevoked(messageId: string): Promise<boolean> {
    const key = `${REVOKED_PREFIX}${messageId}`;
    const data = await this.backend.get(key);
    return data !== null;
  }

  /**
   * Get revocation info for a message
   */
  async getRevocationInfo(messageId: string): Promise<{
    revokedBy: string;
    reason: string;
    revokedAt: number;
  } | null> {
    const key = `${REVOKED_PREFIX}${messageId}`;
    const data = await this.backend.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Permanently delete a message from storage
   * This removes the message data entirely
   */
  async permanentlyDelete(conversationId: string, messageId: string): Promise<void> {
    const key = this.getMessageKey(conversationId, messageId);
    await this.backend.delete(key);
    
    // Also clean up deletion and revocation markers
    await this.backend.delete(`${DELETED_PREFIX}${messageId}`);
    await this.backend.delete(`${REVOKED_PREFIX}${messageId}`);
  }

  /**
   * Delete all messages in a conversation
   */
  async deleteConversationMessages(conversationId: string): Promise<void> {
    const keys = await this.backend.list();
    const prefix = `${MESSAGE_PREFIX}${conversationId}:`;
    
    for (const key of keys) {
      if (key.startsWith(prefix)) {
        const messageId = key.slice(prefix.length);
        await this.backend.delete(key);
        await this.backend.delete(`${DELETED_PREFIX}${messageId}`);
        await this.backend.delete(`${REVOKED_PREFIX}${messageId}`);
      }
    }
  }

  /**
   * Get message key for storage
   */
  private getMessageKey(conversationId: string, messageId: string): string {
    return `${MESSAGE_PREFIX}${conversationId}:${messageId}`;
  }

  /**
   * Convert bytes to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert hex string to bytes
   */
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
}
