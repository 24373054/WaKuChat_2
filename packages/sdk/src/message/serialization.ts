/**
 * Message serialization/deserialization module
 * Uses Protobuf for efficient binary encoding
 */

import { encrypted_chat } from '../proto/index.js';
import type { MessageType, ConversationType } from '../types.js';

const PROTOCOL_VERSION = 1;

/**
 * Input for creating a ChatMessage
 */
export interface ChatMessageInput {
  messageId: string;
  senderId: string;
  conversationId: string;
  convType: ConversationType;
  type: MessageType;
  timestamp: number;
  payload: Uint8Array;
}

/**
 * Decoded ChatMessage
 */
export interface DecodedChatMessage {
  messageId: string;
  senderId: string;
  conversationId: string;
  convType: ConversationType;
  type: MessageType;
  timestamp: number;
  payload: Uint8Array;
  version: number;
}

/**
 * Serialize a ChatMessage to bytes
 */
export function serializeChatMessage(input: ChatMessageInput): Uint8Array {
  const message = encrypted_chat.ChatMessage.create({
    messageId: input.messageId,
    senderId: input.senderId,
    conversationId: input.conversationId,
    convType: convTypeToProto(input.convType),
    type: messageTypeToProto(input.type),
    timestamp: input.timestamp,
    payload: input.payload,
    version: PROTOCOL_VERSION,
  });

  return encrypted_chat.ChatMessage.encode(message).finish();
}

/**
 * Deserialize bytes to a ChatMessage
 */
export function deserializeChatMessage(data: Uint8Array): DecodedChatMessage {
  const message = encrypted_chat.ChatMessage.decode(data);
  
  return {
    messageId: message.messageId,
    senderId: message.senderId,
    conversationId: message.conversationId,
    convType: protoToConvType(message.convType),
    type: protoToMessageType(message.type),
    timestamp: Number(message.timestamp),
    payload: message.payload,
    version: message.version,
  };
}

/**
 * Serialize a TextPayload
 */
export function serializeTextPayload(content: string): Uint8Array {
  const payload = encrypted_chat.TextPayload.create({ content });
  return encrypted_chat.TextPayload.encode(payload).finish();
}

/**
 * Deserialize a TextPayload
 */
export function deserializeTextPayload(data: Uint8Array): string {
  const payload = encrypted_chat.TextPayload.decode(data);
  return payload.content;
}

/**
 * Serialize a RevokePayload
 */
export function serializeRevokePayload(targetMessageId: string, reason?: string): Uint8Array {
  const payload = encrypted_chat.RevokePayload.create({
    targetMessageId,
    reason: reason ?? '',
  });
  return encrypted_chat.RevokePayload.encode(payload).finish();
}

/**
 * Deserialize a RevokePayload
 */
export function deserializeRevokePayload(data: Uint8Array): { targetMessageId: string; reason: string } {
  const payload = encrypted_chat.RevokePayload.decode(data);
  return {
    targetMessageId: payload.targetMessageId,
    reason: payload.reason,
  };
}

// Type conversion helpers
function messageTypeToProto(type: MessageType): encrypted_chat.MessageType {
  const mapping: Record<MessageType, encrypted_chat.MessageType> = {
    TEXT: encrypted_chat.MessageType.TEXT,
    REVOKE: encrypted_chat.MessageType.REVOKE,
    KEY_EXCHANGE: encrypted_chat.MessageType.KEY_EXCHANGE,
    GROUP_INVITE: encrypted_chat.MessageType.GROUP_INVITE,
    GROUP_JOIN: encrypted_chat.MessageType.GROUP_JOIN,
    GROUP_LEAVE: encrypted_chat.MessageType.GROUP_LEAVE,
    GROUP_KEY_UPDATE: encrypted_chat.MessageType.GROUP_KEY_UPDATE,
  };
  return mapping[type];
}

function protoToMessageType(type: encrypted_chat.MessageType): MessageType {
  const mapping: Record<encrypted_chat.MessageType, MessageType> = {
    [encrypted_chat.MessageType.TEXT]: 'TEXT',
    [encrypted_chat.MessageType.REVOKE]: 'REVOKE',
    [encrypted_chat.MessageType.KEY_EXCHANGE]: 'KEY_EXCHANGE',
    [encrypted_chat.MessageType.GROUP_INVITE]: 'GROUP_INVITE',
    [encrypted_chat.MessageType.GROUP_JOIN]: 'GROUP_JOIN',
    [encrypted_chat.MessageType.GROUP_LEAVE]: 'GROUP_LEAVE',
    [encrypted_chat.MessageType.GROUP_KEY_UPDATE]: 'GROUP_KEY_UPDATE',
  };
  return mapping[type];
}

function convTypeToProto(type: ConversationType): encrypted_chat.ConversationType {
  return type === 'direct' 
    ? encrypted_chat.ConversationType.DIRECT 
    : encrypted_chat.ConversationType.GROUP;
}

function protoToConvType(type: encrypted_chat.ConversationType): ConversationType {
  return type === encrypted_chat.ConversationType.DIRECT ? 'direct' : 'group';
}
