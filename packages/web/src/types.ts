/**
 * Web app types
 */

import type { Identity, Conversation, Message } from '@waku-chat/sdk';

export interface AppState {
  identity: Identity | null;
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Map<string, Message[]>;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

export type AppView = 'identity' | 'conversations' | 'chat';

export interface StoredConversationData {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  members: string[];
  admins: string[];
  peerPublicKey?: string;
  sessionKey: string;
}
