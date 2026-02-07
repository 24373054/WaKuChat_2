/**
 * Conversation manager for handling conversation lifecycle
 * Provides high-level API for creating, joining, and managing conversations
 */

import { Identity } from '../identity/identity.js';
import { Conversation, deriveDirectConversationId } from './conversation.js';
import { ConversationStorage } from './storage.js';
import type {
  GroupInviteData,
  GroupMember,
  EncryptedGroupKeyShare,
} from './types.js';
import type { StorageBackend } from '../identity/storage.js';
import { eciesEncrypt, serializeEciesData } from '../crypto/ecies.js';

export interface PublicKeyResolver {
  getPublicKey(userId: string): Promise<Uint8Array | null>;
}

/**
 * In-memory public key cache
 */
export class InMemoryPublicKeyResolver implements PublicKeyResolver {
  private keys: Map<string, Uint8Array> = new Map();

  async getPublicKey(userId: string): Promise<Uint8Array | null> {
    return this.keys.get(userId) ?? null;
  }

  setPublicKey(userId: string, publicKey: Uint8Array): void {
    this.keys.set(userId, publicKey);
  }

  removePublicKey(userId: string): void {
    this.keys.delete(userId);
  }

  clear(): void {
    this.keys.clear();
  }
}

/**
 * Conversation manager
 */
export class ConversationManager {
  private identity: Identity;
  private storage: ConversationStorage;
  private publicKeyResolver: PublicKeyResolver;
  private conversations: Map<string, Conversation> = new Map();

  constructor(
    identity: Identity,
    storageBackend: StorageBackend,
    publicKeyResolver?: PublicKeyResolver
  ) {
    this.identity = identity;
    // Use the private key hash as master key for storage encryption
    this.storage = new ConversationStorage(storageBackend, identity.privateKey);
    this.publicKeyResolver = publicKeyResolver ?? new InMemoryPublicKeyResolver();
  }


  /**
   * Initialize the manager by loading stored conversations
   */
  async init(): Promise<void> {
    try {
      console.log('ConversationManager.init: Loading conversations from storage...');
      const conversations = await this.storage.loadAll();
      console.log('ConversationManager.init: Loaded', conversations.length, 'conversations');
      for (const conv of conversations) {
        console.log('  - Conversation:', conv.id, conv.type, conv.name);
        this.conversations.set(conv.id, conv);
      }
    } catch (error) {
      console.error('ConversationManager.init: Error loading conversations:', error);
    }
  }

  /**
   * Create a direct (1:1) conversation with another user
   */
  async createDirectConversation(peerUserId: string): Promise<Conversation> {
    // Check if conversation already exists
    const existingId = deriveDirectConversationId(this.identity.userId, peerUserId);
    const existing = this.conversations.get(existingId);
    if (existing) {
      return existing;
    }

    // Get peer's public key
    const peerPublicKey = await this.publicKeyResolver.getPublicKey(peerUserId);
    if (!peerPublicKey) {
      throw new Error(`Public key not found for user: ${peerUserId}`);
    }

    // Create the conversation
    const conversation = Conversation.createDirect(
      {
        myUserId: this.identity.userId,
        peerUserId,
        peerPublicKey,
      },
      this.identity.privateKey
    );

    // Store and cache
    await this.storage.save(conversation);
    this.conversations.set(conversation.id, conversation);

    return conversation;
  }

  /**
   * Create a direct conversation with a known public key
   * Useful when you have the public key but haven't registered it yet
   */
  async createDirectConversationWithKey(
    peerUserId: string,
    peerPublicKey: Uint8Array
  ): Promise<Conversation> {
    // Register the public key
    if (this.publicKeyResolver instanceof InMemoryPublicKeyResolver) {
      this.publicKeyResolver.setPublicKey(peerUserId, peerPublicKey);
    }

    return this.createDirectConversation(peerUserId);
  }

  /**
   * Create a new group conversation
   */
  async createGroupConversation(name: string): Promise<Conversation> {
    const conversation = Conversation.createGroup({
      name,
      creatorUserId: this.identity.userId,
    });

    // Store and cache
    await this.storage.save(conversation);
    this.conversations.set(conversation.id, conversation);

    return conversation;
  }

  /**
   * Join a group conversation from invite data
   */
  async joinGroupConversation(inviteData: GroupInviteData): Promise<Conversation> {
    // Check if already a member
    const existing = this.conversations.get(inviteData.groupId);
    if (existing) {
      return existing;
    }

    const conversation = await Conversation.joinGroup(
      inviteData,
      this.identity.userId,
      this.identity.privateKey
    );

    // Store and cache
    await this.storage.save(conversation);
    this.conversations.set(conversation.id, conversation);

    return conversation;
  }


  /**
   * Create an invite for a user to join a group
   */
  async createGroupInvite(
    conversationId: string,
    inviteeUserId: string
  ): Promise<GroupInviteData> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    if (conversation.type !== 'group') {
      throw new Error('Cannot create invite for direct conversation');
    }
    if (!conversation.isAdmin(this.identity.userId)) {
      throw new Error('Only admins can invite new members');
    }

    // Get invitee's public key
    const inviteePublicKey = await this.publicKeyResolver.getPublicKey(inviteeUserId);
    if (!inviteePublicKey) {
      throw new Error(`Public key not found for user: ${inviteeUserId}`);
    }

    return conversation.createInvite(inviteePublicKey);
  }

  /**
   * Create an invite with a known public key
   */
  async createGroupInviteWithKey(
    conversationId: string,
    inviteeUserId: string,
    inviteePublicKey: Uint8Array
  ): Promise<GroupInviteData> {
    // Register the public key
    if (this.publicKeyResolver instanceof InMemoryPublicKeyResolver) {
      this.publicKeyResolver.setPublicKey(inviteeUserId, inviteePublicKey);
    }

    return this.createGroupInvite(conversationId, inviteeUserId);
  }

  /**
   * Add a member to a group (after they've joined)
   */
  async addMemberToGroup(conversationId: string, userId: string): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.addMember(userId);
    await this.storage.update(conversation);
  }

  /**
   * Remove a member from a group
   */
  async removeMemberFromGroup(conversationId: string, userId: string): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    if (!conversation.isAdmin(this.identity.userId)) {
      throw new Error('Only admins can remove members');
    }

    conversation.removeMember(userId);
    await this.storage.update(conversation);
  }

  /**
   * Leave a group conversation
   */
  async leaveGroup(conversationId: string): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    if (conversation.type !== 'group') {
      throw new Error('Cannot leave a direct conversation');
    }

    // Remove from local storage
    await this.storage.delete(conversationId);
    this.conversations.delete(conversationId);
  }

  /**
   * Set admin status for a group member
   */
  async setGroupAdmin(
    conversationId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    if (!conversation.isAdmin(this.identity.userId)) {
      throw new Error('Only admins can change admin status');
    }

    conversation.setAdmin(userId, isAdmin);
    await this.storage.update(conversation);
  }


  /**
   * Distribute group key to all members
   * Returns encrypted key shares for each member
   */
  async distributeGroupKey(conversationId: string): Promise<EncryptedGroupKeyShare[]> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    if (conversation.type !== 'group') {
      throw new Error('Cannot distribute key for direct conversation');
    }
    if (!conversation.isAdmin(this.identity.userId)) {
      throw new Error('Only admins can distribute group keys');
    }

    const shares: EncryptedGroupKeyShare[] = [];

    for (const memberId of conversation.members) {
      // Skip ourselves
      if (memberId === this.identity.userId) {
        continue;
      }

      const memberPublicKey = await this.publicKeyResolver.getPublicKey(memberId);
      if (!memberPublicKey) {
        console.warn(`Public key not found for member: ${memberId}`);
        continue;
      }

      const encryptedData = await eciesEncrypt(conversation.sessionKey, memberPublicKey);
      const serializedKey = serializeEciesData(encryptedData);

      shares.push({
        userId: memberId,
        encryptedKey: serializedKey,
      });
    }

    return shares;
  }

  /**
   * Rotate the group key and distribute to all members
   */
  async rotateGroupKey(conversationId: string): Promise<EncryptedGroupKeyShare[]> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    if (!conversation.isAdmin(this.identity.userId)) {
      throw new Error('Only admins can rotate group keys');
    }

    // Rotate the key
    conversation.rotateGroupKey();
    await this.storage.update(conversation);

    // Distribute the new key
    return this.distributeGroupKey(conversationId);
  }

  /**
   * Get a conversation by ID
   */
  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get all conversations
   */
  getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  /**
   * Get direct conversations only
   */
  getDirectConversations(): Conversation[] {
    return this.getAllConversations().filter(c => c.type === 'direct');
  }

  /**
   * Get group conversations only
   */
  getGroupConversations(): Conversation[] {
    return this.getAllConversations().filter(c => c.type === 'group');
  }

  /**
   * Find a direct conversation with a specific user
   */
  findDirectConversation(peerUserId: string): Conversation | undefined {
    const expectedId = deriveDirectConversationId(this.identity.userId, peerUserId);
    return this.conversations.get(expectedId);
  }

  /**
   * Check if user can revoke a message in a conversation
   */
  canRevokeMessage(conversationId: string, messageSenderId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }
    return conversation.canRevoke(this.identity.userId, messageSenderId);
  }

  /**
   * Get group members with their details
   */
  async getGroupMembers(conversationId: string): Promise<GroupMember[]> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    if (conversation.type !== 'group') {
      throw new Error('Not a group conversation');
    }

    const members: GroupMember[] = [];
    for (const userId of conversation.members) {
      const publicKey = await this.publicKeyResolver.getPublicKey(userId);
      members.push({
        userId,
        publicKey: publicKey ?? new Uint8Array(),
        isAdmin: conversation.isAdmin(userId),
        joinedAt: conversation.createdAt, // We don't track individual join times
      });
    }

    return members;
  }

  /**
   * Register a public key for a user
   */
  registerPublicKey(userId: string, publicKey: Uint8Array): void {
    if (this.publicKeyResolver instanceof InMemoryPublicKeyResolver) {
      this.publicKeyResolver.setPublicKey(userId, publicKey);
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await this.storage.delete(conversationId);
    this.conversations.delete(conversationId);
  }
}
