/**
 * Conversation class for managing chat sessions
 * Handles both direct (1:1) and group conversations
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  deriveSessionKey,
  generateAesKey,
  eciesEncrypt,
  eciesDecrypt,
  serializeEciesData,
  deserializeEciesData,
} from '../crypto/index.js';
import type {
  ConversationType,
  ConversationData,
  DirectConversationParams,
  GroupConversationParams,
  GroupInviteData,
  EncryptedGroupKeyShare,
} from './types.js';

/**
 * Generate a deterministic conversation ID from two user IDs
 * Sorts the IDs to ensure both parties derive the same ID
 */
export function deriveDirectConversationId(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  const combined = sorted.join(':');
  const encoder = new TextEncoder();
  const hash = sha256(encoder.encode(combined));
  // Return first 16 bytes as hex (32 characters)
  return bytesToHex(hash.slice(0, 16));
}

/**
 * Generate a unique group ID
 */
export function generateGroupId(): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const timestamp = Date.now().toString(16).padStart(12, '0');
  return timestamp + bytesToHex(randomBytes);
}

/**
 * Conversation class representing a chat session
 */
export class Conversation implements ConversationData {
  public readonly id: string;
  public readonly type: ConversationType;
  public name?: string;
  public readonly createdAt: number;
  public members: string[];
  public admins: string[];
  public groupKeyVersion: number;

  private _sessionKey: Uint8Array;

  private constructor(
    data: ConversationData,
    sessionKey: Uint8Array
  ) {
    this.id = data.id;
    this.type = data.type;
    this.name = data.name;
    this.createdAt = data.createdAt;
    this.members = [...data.members];
    this.admins = data.admins ? [...data.admins] : [];
    this.groupKeyVersion = data.groupKeyVersion ?? 1;
    this._sessionKey = sessionKey;
  }


  /**
   * Get the session key for encrypting/decrypting messages
   */
  get sessionKey(): Uint8Array {
    return this._sessionKey;
  }

  /**
   * Create a direct (1:1) conversation
   * The conversation ID is deterministically derived from both user IDs
   * The session key is derived using ECDH + HKDF
   */
  static createDirect(
    params: DirectConversationParams,
    myPrivateKey: Uint8Array
  ): Conversation {
    const { myUserId, peerUserId, peerPublicKey } = params;

    // Derive deterministic conversation ID
    const conversationId = deriveDirectConversationId(myUserId, peerUserId);

    // Derive session key using ECDH + HKDF
    const sessionKey = deriveSessionKey(myPrivateKey, peerPublicKey, conversationId);

    const data: ConversationData = {
      id: conversationId,
      type: 'direct',
      createdAt: Date.now(),
      members: [myUserId, peerUserId].sort(),
      admins: [],
    };

    return new Conversation(data, sessionKey);
  }

  /**
   * Create a group conversation
   * Generates a new group ID and random group key
   * The creator becomes the first admin
   */
  static createGroup(params: GroupConversationParams): Conversation {
    const { name, creatorUserId } = params;

    // Generate unique group ID
    const groupId = generateGroupId();

    // Generate random group key
    const groupKey = generateAesKey();

    const data: ConversationData = {
      id: groupId,
      type: 'group',
      name,
      createdAt: Date.now(),
      members: [creatorUserId],
      admins: [creatorUserId],
      groupKeyVersion: 1,
    };

    return new Conversation(data, groupKey);
  }

  /**
   * Join a group conversation from invite data
   */
  static async joinGroup(
    inviteData: GroupInviteData,
    myUserId: string,
    myPrivateKey: Uint8Array
  ): Promise<Conversation> {
    // Decrypt the group key using our private key
    const eciesData = deserializeEciesData(inviteData.encryptedGroupKey);
    const groupKey = await eciesDecrypt(eciesData, myPrivateKey);

    const data: ConversationData = {
      id: inviteData.groupId,
      type: 'group',
      name: inviteData.groupName,
      createdAt: Date.now(),
      members: [...inviteData.members, myUserId],
      admins: inviteData.admins,
      groupKeyVersion: inviteData.keyVersion,
    };

    return new Conversation(data, groupKey);
  }


  /**
   * Restore a conversation from stored data and session key
   */
  static restore(data: ConversationData, sessionKey: Uint8Array): Conversation {
    return new Conversation(data, sessionKey);
  }

  /**
   * Create an invite for a new member to join the group
   * Encrypts the group key with the invitee's public key using ECIES
   */
  async createInvite(inviteePublicKey: Uint8Array): Promise<GroupInviteData> {
    if (this.type !== 'group') {
      throw new Error('Cannot create invite for direct conversation');
    }

    const encryptedData = await eciesEncrypt(this._sessionKey, inviteePublicKey);
    const serializedKey = serializeEciesData(encryptedData);

    return {
      groupId: this.id,
      groupName: this.name ?? '',
      encryptedGroupKey: serializedKey,
      members: this.members,
      admins: this.admins,
      keyVersion: this.groupKeyVersion,
    };
  }

  /**
   * Encrypt the group key for a specific member
   * Used for key distribution
   */
  async encryptGroupKeyFor(memberPublicKey: Uint8Array): Promise<EncryptedGroupKeyShare> {
    if (this.type !== 'group') {
      throw new Error('Cannot encrypt group key for direct conversation');
    }

    const encryptedData = await eciesEncrypt(this._sessionKey, memberPublicKey);
    const serializedKey = serializeEciesData(encryptedData);

    // We don't have the userId here, caller should set it
    return {
      userId: '',
      encryptedKey: serializedKey,
    };
  }

  /**
   * Add a member to the group
   */
  addMember(userId: string): void {
    if (this.type !== 'group') {
      throw new Error('Cannot add member to direct conversation');
    }
    if (!this.members.includes(userId)) {
      this.members.push(userId);
    }
  }

  /**
   * Remove a member from the group
   */
  removeMember(userId: string): void {
    if (this.type !== 'group') {
      throw new Error('Cannot remove member from direct conversation');
    }
    const index = this.members.indexOf(userId);
    if (index !== -1) {
      this.members.splice(index, 1);
    }
    // Also remove from admins if they were an admin
    const adminIndex = this.admins.indexOf(userId);
    if (adminIndex !== -1) {
      this.admins.splice(adminIndex, 1);
    }
  }

  /**
   * Check if a user is a member of this conversation
   */
  isMember(userId: string): boolean {
    return this.members.includes(userId);
  }

  /**
   * Check if a user is an admin of this group
   */
  isAdmin(userId: string): boolean {
    return this.admins.includes(userId);
  }

  /**
   * Set admin status for a member
   */
  setAdmin(userId: string, isAdmin: boolean): void {
    if (this.type !== 'group') {
      throw new Error('Cannot set admin for direct conversation');
    }
    if (!this.members.includes(userId)) {
      throw new Error('User is not a member of this group');
    }

    const adminIndex = this.admins.indexOf(userId);
    if (isAdmin && adminIndex === -1) {
      this.admins.push(userId);
    } else if (!isAdmin && adminIndex !== -1) {
      this.admins.splice(adminIndex, 1);
    }
  }


  /**
   * Check if a user can revoke a message
   * In direct conversations: only the sender can revoke
   * In group conversations: sender or any admin can revoke
   */
  canRevoke(userId: string, messageSenderId: string): boolean {
    // Sender can always revoke their own message
    if (userId === messageSenderId) {
      return true;
    }
    // In groups, admins can revoke any message
    if (this.type === 'group' && this.isAdmin(userId)) {
      return true;
    }
    return false;
  }

  /**
   * Update the group key (for key rotation)
   * Returns the new key for distribution
   */
  rotateGroupKey(): Uint8Array {
    if (this.type !== 'group') {
      throw new Error('Cannot rotate key for direct conversation');
    }
    this._sessionKey = generateAesKey();
    this.groupKeyVersion++;
    return this._sessionKey;
  }

  /**
   * Update the session key (used when receiving a key update)
   */
  updateSessionKey(newKey: Uint8Array, newVersion: number): void {
    if (this.type !== 'group') {
      throw new Error('Cannot update key for direct conversation');
    }
    if (newVersion <= this.groupKeyVersion) {
      throw new Error('New key version must be greater than current version');
    }
    this._sessionKey = newKey;
    this.groupKeyVersion = newVersion;
  }

  /**
   * Get conversation data for storage (without session key)
   */
  toData(): ConversationData {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      createdAt: this.createdAt,
      members: [...this.members],
      admins: [...this.admins],
      groupKeyVersion: this.groupKeyVersion,
    };
  }

  /**
   * Get the peer's userId in a direct conversation
   */
  getPeerUserId(myUserId: string): string | null {
    if (this.type !== 'direct') {
      return null;
    }
    return this.members.find(id => id !== myUserId) ?? null;
  }
}
