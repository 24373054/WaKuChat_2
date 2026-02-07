/**
 * Revoke permission validation module
 * Implements permission checking for message revocation
 * 
 * Permission rules:
 * - Direct conversations: Only the original sender can revoke their messages
 * - Group conversations: Original sender OR any admin can revoke messages
 */

import type { Conversation } from '../conversation/conversation.js';
import type { ConversationType } from '../types.js';

/**
 * Result of permission validation
 */
export interface RevokePermissionResult {
  /** Whether the revoke is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
  /** The rule that was applied */
  rule: 'sender' | 'admin' | 'denied';
}

/**
 * Input for permission validation
 */
export interface RevokePermissionInput {
  /** User ID attempting to revoke */
  revokerId: string;
  /** User ID of the original message sender */
  originalSenderId: string;
  /** Type of conversation */
  conversationType: ConversationType;
  /** List of admin user IDs (for group conversations) */
  admins?: string[];
}

/**
 * Validate if a user has permission to revoke a message
 * 
 * **Validates: Requirements 4.3 (撤回权限验证)**
 * - 单聊中只有原发送者可撤回
 * - 群聊中原发送者或管理员可撤回
 * - 非法撤回请求被忽略
 */
export function validateRevokePermission(input: RevokePermissionInput): RevokePermissionResult {
  const { revokerId, originalSenderId, conversationType, admins = [] } = input;

  // Rule 1: Original sender can always revoke their own message
  if (revokerId === originalSenderId) {
    return {
      allowed: true,
      reason: 'Original sender can revoke their own message',
      rule: 'sender',
    };
  }

  // Rule 2: In group conversations, admins can revoke any message
  if (conversationType === 'group' && admins.includes(revokerId)) {
    return {
      allowed: true,
      reason: 'Group admin can revoke any message',
      rule: 'admin',
    };
  }

  // Rule 3: All other cases are denied
  if (conversationType === 'direct') {
    return {
      allowed: false,
      reason: 'Only the original sender can revoke messages in direct conversations',
      rule: 'denied',
    };
  }

  return {
    allowed: false,
    reason: 'Only the original sender or group admins can revoke messages in group conversations',
    rule: 'denied',
  };
}

/**
 * Validate revoke permission using a Conversation object
 */
export function validateRevokePermissionWithConversation(
  conversation: Conversation,
  revokerId: string,
  originalSenderId: string
): RevokePermissionResult {
  return validateRevokePermission({
    revokerId,
    originalSenderId,
    conversationType: conversation.type,
    admins: conversation.admins,
  });
}

/**
 * Check if a user can revoke a specific message
 * Convenience function that returns a simple boolean
 */
export function canRevokeMessage(
  revokerId: string,
  originalSenderId: string,
  conversationType: ConversationType,
  admins: string[] = []
): boolean {
  const result = validateRevokePermission({
    revokerId,
    originalSenderId,
    conversationType,
    admins,
  });
  return result.allowed;
}

/**
 * Get a human-readable explanation of revoke permissions for a conversation type
 */
export function getRevokePermissionExplanation(conversationType: ConversationType): string {
  if (conversationType === 'direct') {
    return 'In direct conversations, only the original sender can revoke their messages.';
  }
  return 'In group conversations, the original sender or any group admin can revoke messages.';
}
