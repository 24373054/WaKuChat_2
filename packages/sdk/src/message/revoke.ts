/**
 * Message revocation module
 * Handles creating and processing revoke (tombstone) control messages
 */

import { generateMessageId } from './message-id.js';
import {
  serializeChatMessage,
  deserializeChatMessage,
  serializeRevokePayload,
  deserializeRevokePayload,
} from './serialization.js';
import { createEncryptedEnvelope, openEncryptedEnvelope } from './envelope.js';
import { signMessage, verifyMessageSignature } from './signing.js';
import type { ConversationType, MessageType } from '../types.js';

/**
 * Input for creating a revoke message
 */
export interface RevokeMessageInput {
  /** ID of the message to revoke */
  targetMessageId: string;
  /** Conversation ID where the message was sent */
  conversationId: string;
  /** Conversation type */
  convType: ConversationType;
  /** User ID of the person revoking */
  revokerId: string;
  /** Private key for signing */
  privateKey: Uint8Array;
  /** Session key for encryption */
  sessionKey: Uint8Array;
  /** Optional reason for revocation */
  reason?: string;
}

/**
 * Result of creating a revoke message
 */
export interface RevokeMessageResult {
  /** The revoke message ID */
  messageId: string;
  /** Encrypted envelope ready to send */
  envelope: Uint8Array;
  /** Timestamp of the revoke message */
  timestamp: number;
}

/**
 * Decoded revoke message
 */
export interface DecodedRevokeMessage {
  /** The revoke message ID */
  messageId: string;
  /** ID of the message being revoked */
  targetMessageId: string;
  /** User ID of the person who revoked */
  revokerId: string;
  /** Conversation ID */
  conversationId: string;
  /** Conversation type */
  convType: ConversationType;
  /** Timestamp of the revoke message */
  timestamp: number;
  /** Reason for revocation */
  reason: string;
  /** Whether the signature was verified */
  verified: boolean;
}

/**
 * Create a revoke (tombstone) control message
 * This message signals that a previous message should be marked as revoked
 */
export async function createRevokeMessage(
  input: RevokeMessageInput
): Promise<RevokeMessageResult> {
  const timestamp = Date.now();
  const messageId = generateMessageId(timestamp, input.revokerId);

  // Create the revoke payload
  const revokePayload = serializeRevokePayload(input.targetMessageId, input.reason);

  // Create the chat message
  const chatMessage = serializeChatMessage({
    messageId,
    senderId: input.revokerId,
    conversationId: input.conversationId,
    convType: input.convType,
    type: 'REVOKE' as MessageType,
    timestamp,
    payload: revokePayload,
  });

  // Sign the message
  const signature = await signMessage(
    {
      messageId,
      senderId: input.revokerId,
      conversationId: input.conversationId,
      timestamp,
      messageType: 'REVOKE' as MessageType,
      payload: revokePayload,
    },
    input.privateKey
  );

  // Create encrypted envelope
  const envelope = await createEncryptedEnvelope({
    payload: chatMessage,
    sessionKey: input.sessionKey,
    senderId: input.revokerId,
    timestamp,
    signature,
  });

  return {
    messageId,
    envelope,
    timestamp,
  };
}


/**
 * Decode and verify a revoke message
 * @param envelope - Encrypted envelope containing the revoke message
 * @param sessionKey - Session key for decryption
 * @param publicKeyResolver - Function to resolve public key from user ID
 * @returns Decoded revoke message with verification status
 */
export async function decodeRevokeMessage(
  envelope: Uint8Array,
  sessionKey: Uint8Array,
  publicKeyResolver: (userId: string) => Promise<Uint8Array | null>
): Promise<DecodedRevokeMessage> {
  // Open the encrypted envelope
  const decoded = await openEncryptedEnvelope(envelope, sessionKey);

  // Deserialize the chat message
  const chatMessage = deserializeChatMessage(decoded.payload);

  // Verify this is a revoke message
  if (chatMessage.type !== 'REVOKE') {
    throw new Error(`Expected REVOKE message, got ${chatMessage.type}`);
  }

  // Deserialize the revoke payload
  const revokePayload = deserializeRevokePayload(chatMessage.payload);

  // Verify the signature
  const publicKey = await publicKeyResolver(decoded.senderId);
  let verified = false;

  if (publicKey) {
    verified = verifyMessageSignature(
      {
        messageId: chatMessage.messageId,
        senderId: chatMessage.senderId,
        conversationId: chatMessage.conversationId,
        timestamp: chatMessage.timestamp,
        messageType: chatMessage.type,
        payload: chatMessage.payload,
      },
      decoded.signature,
      publicKey
    );
  }

  return {
    messageId: chatMessage.messageId,
    targetMessageId: revokePayload.targetMessageId,
    revokerId: chatMessage.senderId,
    conversationId: chatMessage.conversationId,
    convType: chatMessage.convType,
    timestamp: chatMessage.timestamp,
    reason: revokePayload.reason,
    verified,
  };
}

/**
 * Check if a message type is a revoke message
 */
export function isRevokeMessage(type: MessageType): boolean {
  return type === 'REVOKE';
}
