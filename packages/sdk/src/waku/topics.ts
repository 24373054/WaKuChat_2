// Content topic generation utilities
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Default pubsub topic for the encrypted chat application
 */
export const DEFAULT_PUBSUB_TOPIC = '/waku/2/default-waku/proto';

/**
 * Protocol version for content topics
 */
export const CONTENT_TOPIC_VERSION = '1';

/**
 * Unique application identifier to avoid conflicts with other apps on public Waku network
 * This is a random string that makes our topics unique
 */
export const APP_ID = 'wkcht-v1';

/**
 * Content topic types
 */
export type ContentTopicType = 'dm' | 'group' | 'system';

/**
 * Generate a content topic for a conversation
 * Format: /{application-name}/{version}/{content-topic-name}/{encoding}
 * 
 * Waku requires the format to be exactly 4 parts separated by /
 * The content-topic-name should be a simple identifier without additional slashes
 * 
 * @param type - Type of conversation (dm, group, system)
 * @param id - Conversation or user ID
 * @returns Content topic string
 */
export function generateContentTopic(type: ContentTopicType, id: string): string {
  // Include APP_ID to avoid conflicts with other apps
  const contentTopicName = `${APP_ID}-${type}-${id}`;
  return `/waku-chat/${CONTENT_TOPIC_VERSION}/${contentTopicName}/proto`;
}

/**
 * Generate a conversation ID for a direct message (DM) conversation
 * The ID is deterministic based on both user IDs, sorted alphabetically
 * 
 * @param userId1 - First user's ID
 * @param userId2 - Second user's ID
 * @returns Deterministic conversation ID
 */
export function generateDMConversationId(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  const combined = sorted.join(':');
  const hash = sha256(new TextEncoder().encode(combined));
  return bytesToHex(hash).slice(0, 32); // Use first 32 hex chars (16 bytes)
}

/**
 * Generate a content topic for a direct message conversation
 * 
 * @param userId1 - First user's ID
 * @param userId2 - Second user's ID
 * @returns Content topic for the DM conversation
 */
export function generateDMContentTopic(userId1: string, userId2: string): string {
  const conversationId = generateDMConversationId(userId1, userId2);
  return generateContentTopic('dm', conversationId);
}

/**
 * Generate a content topic for a group conversation
 * 
 * @param groupId - The group's unique ID
 * @returns Content topic for the group conversation
 */
export function generateGroupContentTopic(groupId: string): string {
  return generateContentTopic('group', groupId);
}

/**
 * Generate a content topic for system messages (key exchange, etc.)
 * 
 * @param targetUserId - The target user's ID
 * @returns Content topic for system messages to the user
 */
export function generateSystemContentTopic(targetUserId: string): string {
  return generateContentTopic('system', targetUserId);
}

/**
 * Parse a content topic to extract its components
 * 
 * @param contentTopic - The content topic string
 * @returns Parsed components or null if invalid
 */
export function parseContentTopic(contentTopic: string): {
  version: string;
  type: ContentTopicType;
  id: string;
} | null {
  // Format: /waku-chat/{version}/{APP_ID}-{type}-{id}/proto
  const regex = new RegExp(`^/waku-chat/(\\d+)/${APP_ID}-(dm|group|system)-([^/]+)/proto$`);
  const match = contentTopic.match(regex);
  
  if (!match) {
    return null;
  }
  
  return {
    version: match[1],
    type: match[2] as ContentTopicType,
    id: match[3],
  };
}

/**
 * Validate a content topic format
 * 
 * @param contentTopic - The content topic to validate
 * @returns True if valid, false otherwise
 */
export function isValidContentTopic(contentTopic: string): boolean {
  return parseContentTopic(contentTopic) !== null;
}
