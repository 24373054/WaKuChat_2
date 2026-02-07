/**
 * Types for conversation management
 */

export type ConversationType = 'direct' | 'group';

export interface ConversationData {
  id: string;
  type: ConversationType;
  name?: string;
  createdAt: number;
  members: string[];
  admins?: string[];
  groupKeyVersion?: number;
}

export interface DirectConversationParams {
  myUserId: string;
  peerUserId: string;
  peerPublicKey: Uint8Array;
}

export interface GroupConversationParams {
  name: string;
  creatorUserId: string;
}

export interface GroupInviteData {
  groupId: string;
  groupName: string;
  encryptedGroupKey: Uint8Array;
  members: string[];
  admins: string[];
  keyVersion: number;
}

export interface GroupMember {
  userId: string;
  publicKey: Uint8Array;
  isAdmin: boolean;
  joinedAt: number;
}

export interface EncryptedGroupKeyShare {
  userId: string;
  encryptedKey: Uint8Array;
}
