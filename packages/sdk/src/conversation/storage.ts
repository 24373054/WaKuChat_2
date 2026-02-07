/**
 * Conversation storage module for persisting conversations
 * Handles encrypted storage of session keys
 */

import { sha256 } from '@noble/hashes/sha256';
import { encrypt, decrypt } from '../crypto/aes.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { Conversation } from './conversation.js';
import type { ConversationData } from './types.js';
import type { StorageBackend } from '../identity/storage.js';

export interface StoredConversation {
  data: ConversationData;
  encryptedSessionKey: string; // hex
  nonce: string; // hex
  updatedAt: number;
}

const CONVERSATION_PREFIX = 'conversation:';
const SESSION_KEY_INFO = 'conversation-storage-key';

/**
 * Derive a storage encryption key from a master key
 */
function deriveStorageKey(masterKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const info = encoder.encode(SESSION_KEY_INFO);
  return sha256(new Uint8Array([...masterKey, ...info]));
}

/**
 * Conversation storage manager
 */
export class ConversationStorage {
  private backend: StorageBackend;
  private storageKey: Uint8Array;

  constructor(backend: StorageBackend, masterKey: Uint8Array) {
    this.backend = backend;
    this.storageKey = deriveStorageKey(masterKey);
  }

  /**
   * Save a conversation with encrypted session key
   */
  async save(conversation: Conversation): Promise<void> {
    const { ciphertext, nonce } = await encrypt(
      conversation.sessionKey,
      this.storageKey
    );

    const stored: StoredConversation = {
      data: conversation.toData(),
      encryptedSessionKey: bytesToHex(ciphertext),
      nonce: bytesToHex(nonce),
      updatedAt: Date.now(),
    };

    const key = `${CONVERSATION_PREFIX}${conversation.id}`;
    await this.backend.set(key, JSON.stringify(stored));
  }


  /**
   * Load a conversation by ID
   */
  async load(conversationId: string): Promise<Conversation | null> {
    const key = `${CONVERSATION_PREFIX}${conversationId}`;
    const data = await this.backend.get(key);

    if (!data) {
      return null;
    }

    const stored: StoredConversation = JSON.parse(data);
    const encryptedKey = hexToBytes(stored.encryptedSessionKey);
    const nonce = hexToBytes(stored.nonce);

    const sessionKey = await decrypt(encryptedKey, this.storageKey, nonce);
    return Conversation.restore(stored.data, sessionKey);
  }

  /**
   * Delete a conversation
   */
  async delete(conversationId: string): Promise<void> {
    const key = `${CONVERSATION_PREFIX}${conversationId}`;
    await this.backend.delete(key);
  }

  /**
   * List all conversation IDs
   */
  async list(): Promise<string[]> {
    const keys = await this.backend.list();
    return keys
      .filter(key => key.startsWith(CONVERSATION_PREFIX))
      .map(key => key.slice(CONVERSATION_PREFIX.length));
  }

  /**
   * Load all conversations
   */
  async loadAll(): Promise<Conversation[]> {
    const ids = await this.list();
    const conversations: Conversation[] = [];

    for (const id of ids) {
      const conversation = await this.load(id);
      if (conversation) {
        conversations.push(conversation);
      }
    }

    return conversations;
  }

  /**
   * Check if a conversation exists
   */
  async exists(conversationId: string): Promise<boolean> {
    const key = `${CONVERSATION_PREFIX}${conversationId}`;
    const data = await this.backend.get(key);
    return data !== null;
  }

  /**
   * Get conversation metadata without decrypting session key
   */
  async getMetadata(conversationId: string): Promise<ConversationData | null> {
    const key = `${CONVERSATION_PREFIX}${conversationId}`;
    const data = await this.backend.get(key);

    if (!data) {
      return null;
    }

    const stored: StoredConversation = JSON.parse(data);
    return stored.data;
  }

  /**
   * Update conversation metadata (members, admins, etc.)
   */
  async update(conversation: Conversation): Promise<void> {
    // Just re-save the conversation
    await this.save(conversation);
  }
}
