/**
 * Message module exports
 * Provides message processing functionality for the encrypted chat SDK
 */

// Message ID generation
export {
  generateMessageId,
  generateMessageIdWithRandom,
  isValidMessageId,
} from './message-id.js';

// Serialization
export {
  serializeChatMessage,
  deserializeChatMessage,
  serializeTextPayload,
  deserializeTextPayload,
  serializeRevokePayload,
  deserializeRevokePayload,
  type ChatMessageInput,
  type DecodedChatMessage,
} from './serialization.js';

// Encrypted envelope
export {
  createEncryptedEnvelope,
  openEncryptedEnvelope,
  extractEnvelopeMetadata,
  type EnvelopeInput,
  type DecodedEnvelope,
} from './envelope.js';

// Signing
export {
  signMessage,
  verifyMessageSignature,
  verifyMessageWithResolver,
  type SigningInput,
  type PublicKeyResolver,
} from './signing.js';

// Deduplication
export {
  DedupeCache,
  type DedupeCacheConfig,
} from './dedupe-cache.js';

// Sender with retry
export {
  MessageSender,
  SendError,
  type MessageSenderConfig,
} from './sender.js';

// Message storage
export {
  MessageStorage,
  type StoredMessage,
} from './storage.js';

// Revoke functionality
export {
  createRevokeMessage,
  decodeRevokeMessage,
  isRevokeMessage,
  type RevokeMessageInput,
  type RevokeMessageResult,
  type DecodedRevokeMessage,
} from './revoke.js';

// Revoke handler
export {
  RevokeHandler,
  type RevokeProcessResult,
  type RevokeEventHandler,
  type RevokeHandlerOptions,
} from './revoke-handler.js';

// Revoke permission validation
export {
  validateRevokePermission,
  validateRevokePermissionWithConversation,
  canRevokeMessage,
  getRevokePermissionExplanation,
  type RevokePermissionResult,
  type RevokePermissionInput,
} from './revoke-permission.js';
