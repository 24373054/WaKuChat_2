// Type definitions for Waku Encrypted Chat SDK

export type MessageType = 
  | 'TEXT'
  | 'REVOKE'
  | 'KEY_EXCHANGE'
  | 'GROUP_INVITE'
  | 'GROUP_JOIN'
  | 'GROUP_LEAVE'
  | 'GROUP_KEY_UPDATE';

// Re-export ConversationType from conversation module for backwards compatibility
export type { ConversationType } from './conversation/types.js';

// Note: Identity is now a class exported from ./identity/index.js
// Use IdentityData interface for plain object representation

// Note: Conversation is now a class exported from ./conversation/index.js
// Use ConversationData interface for plain object representation

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'failed' | 'revoked';
  signature: Uint8Array;
  verified: boolean;
}

export type MessageHandler = (message: Message) => void;
export type Unsubscribe = () => void;
