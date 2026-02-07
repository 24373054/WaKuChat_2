/**
 * Types for ChatClient
 */

import type { Message, MessageHandler, Unsubscribe } from '../types.js';
import type { Identity } from '../identity/identity.js';
import type { Conversation } from '../conversation/conversation.js';
import type { GroupInviteData, GroupMember } from '../conversation/types.js';

/**
 * Configuration for ChatClient
 */
export interface ChatClientConfig {
  /** Bootstrap nodes to connect to */
  bootstrapNodes?: string[];
  /** Use light mode (LightPush + Filter) instead of Relay */
  lightMode?: boolean;
  /** Use mock mode for local development (no network required) */
  mockMode?: boolean;
  /** Callback for connection state changes */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
}

/**
 * Options for fetching history
 */
export interface HistoryOptions {
  /** Start time filter (Unix timestamp in ms) */
  startTime?: number;
  /** End time filter (Unix timestamp in ms) */
  endTime?: number;
  /** Maximum number of messages to return */
  limit?: number;
}

/**
 * ChatClient interface - main entry point for the SDK
 */
export interface IChatClient {
  // Lifecycle
  init(config?: ChatClientConfig): Promise<void>;
  destroy(): Promise<void>;
  isInitialized(): boolean;

  // Identity management
  createIdentity(): Identity;
  loadIdentity(data: string, password: string): Promise<Identity>;
  exportIdentity(password: string): Promise<string>;
  getIdentity(): Identity | null;
  setIdentity(identity: Identity): void;

  // Conversation management
  createDirectConversation(peerUserId: string, peerPublicKey: Uint8Array): Promise<Conversation>;
  createGroupConversation(name: string): Promise<Conversation>;
  joinGroupConversation(inviteData: GroupInviteData): Promise<Conversation>;
  leaveConversation(conversationId: string): Promise<void>;
  getConversations(): Conversation[];
  getConversation(conversationId: string): Conversation | undefined;

  // Message operations
  sendMessage(conversationId: string, content: string): Promise<string>;
  subscribe(conversationId: string, handler: MessageHandler): Promise<Unsubscribe>;
  revokeMessage(conversationId: string, messageId: string, reason?: string): Promise<void>;
  deleteLocalMessage(conversationId: string, messageId: string): Promise<void>;

  // History
  fetchHistory(conversationId: string, options?: HistoryOptions): Promise<Message[]>;

  // Group management
  inviteToGroup(groupId: string, userId: string, userPublicKey: Uint8Array): Promise<GroupInviteData>;
  setGroupAdmin(groupId: string, userId: string, isAdmin: boolean): Promise<void>;
  getGroupMembers(groupId: string): Promise<GroupMember[]>;

  // Public key management
  registerPublicKey(userId: string, publicKey: Uint8Array): void;
}
