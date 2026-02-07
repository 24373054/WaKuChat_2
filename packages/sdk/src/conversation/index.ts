/**
 * Conversation module exports
 */

export {
  Conversation,
  deriveDirectConversationId,
  generateGroupId,
} from './conversation.js';

export {
  ConversationStorage,
  type StoredConversation,
} from './storage.js';

export {
  ConversationManager,
  InMemoryPublicKeyResolver,
} from './manager.js';

export type {
  ConversationType,
  ConversationData,
  DirectConversationParams,
  GroupConversationParams,
  GroupInviteData,
  GroupMember,
  EncryptedGroupKeyShare,
} from './types.js';

// Re-export PublicKeyResolver with a different name to avoid conflict
export type { PublicKeyResolver as ConversationPublicKeyResolver } from './manager.js';
