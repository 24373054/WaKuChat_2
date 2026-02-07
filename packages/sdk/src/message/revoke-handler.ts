/**
 * Revoke message handler
 * Processes incoming revoke messages and updates local storage
 */

import { decodeRevokeMessage, type DecodedRevokeMessage } from './revoke.js';
import { MessageStorage } from './storage.js';
import type { Conversation } from '../conversation/conversation.js';

/**
 * Result of processing a revoke message
 */
export interface RevokeProcessResult {
  /** Whether the revoke was accepted */
  accepted: boolean;
  /** The decoded revoke message */
  revokeMessage: DecodedRevokeMessage;
  /** Reason if rejected */
  rejectionReason?: string;
}

/**
 * Callback for revoke events
 */
export type RevokeEventHandler = (result: RevokeProcessResult) => void;

/**
 * Options for the revoke handler
 */
export interface RevokeHandlerOptions {
  /** Message storage for persisting revocation status */
  storage: MessageStorage;
  /** Function to get conversation by ID */
  getConversation: (conversationId: string) => Conversation | undefined;
  /** Function to resolve public key from user ID */
  publicKeyResolver: (userId: string) => Promise<Uint8Array | null>;
  /** Function to get the sender ID of a message */
  getMessageSenderId: (conversationId: string, messageId: string) => Promise<string | null>;
  /** Optional callback for revoke events */
  onRevoke?: RevokeEventHandler;
}

/**
 * Handler for processing revoke messages
 */
export class RevokeHandler {
  private storage: MessageStorage;
  private getConversation: (conversationId: string) => Conversation | undefined;
  private publicKeyResolver: (userId: string) => Promise<Uint8Array | null>;
  private getMessageSenderId: (conversationId: string, messageId: string) => Promise<string | null>;
  private onRevoke?: RevokeEventHandler;

  constructor(options: RevokeHandlerOptions) {
    this.storage = options.storage;
    this.getConversation = options.getConversation;
    this.publicKeyResolver = options.publicKeyResolver;
    this.getMessageSenderId = options.getMessageSenderId;
    this.onRevoke = options.onRevoke;
  }

  /**
   * Process an incoming revoke message
   * Validates permissions and updates storage if valid
   */
  async processRevokeMessage(
    envelope: Uint8Array,
    sessionKey: Uint8Array
  ): Promise<RevokeProcessResult> {
    // Decode the revoke message
    const revokeMessage = await decodeRevokeMessage(
      envelope,
      sessionKey,
      this.publicKeyResolver
    );

    // Verify signature
    if (!revokeMessage.verified) {
      const result: RevokeProcessResult = {
        accepted: false,
        revokeMessage,
        rejectionReason: 'Invalid signature',
      };
      this.onRevoke?.(result);
      return result;
    }

    // Get the conversation
    const conversation = this.getConversation(revokeMessage.conversationId);
    if (!conversation) {
      const result: RevokeProcessResult = {
        accepted: false,
        revokeMessage,
        rejectionReason: 'Conversation not found',
      };
      this.onRevoke?.(result);
      return result;
    }

    // Get the original message sender
    const originalSenderId = await this.getMessageSenderId(
      revokeMessage.conversationId,
      revokeMessage.targetMessageId
    );

    // Validate revoke permission
    const permissionResult = await this.validateRevokePermission(
      conversation,
      revokeMessage.revokerId,
      originalSenderId
    );

    if (!permissionResult.allowed) {
      const result: RevokeProcessResult = {
        accepted: false,
        revokeMessage,
        rejectionReason: permissionResult.reason,
      };
      this.onRevoke?.(result);
      return result;
    }

    // Mark the message as revoked in storage
    await this.storage.markAsRevoked(
      revokeMessage.targetMessageId,
      revokeMessage.revokerId,
      revokeMessage.reason
    );

    const result: RevokeProcessResult = {
      accepted: true,
      revokeMessage,
    };
    this.onRevoke?.(result);
    return result;
  }


  /**
   * Validate if a user has permission to revoke a message
   */
  private async validateRevokePermission(
    conversation: Conversation,
    revokerId: string,
    originalSenderId: string | null
  ): Promise<{ allowed: boolean; reason?: string }> {
    // If we don't know the original sender, we can't validate
    // In this case, we accept the revoke if the signature is valid
    // This handles the case where we receive a revoke before the original message
    if (originalSenderId === null) {
      return { allowed: true };
    }

    // Check if the revoker has permission
    if (conversation.canRevoke(revokerId, originalSenderId)) {
      return { allowed: true };
    }

    // Determine the specific reason for rejection
    if (conversation.type === 'direct') {
      return {
        allowed: false,
        reason: 'Only the original sender can revoke messages in direct conversations',
      };
    } else {
      return {
        allowed: false,
        reason: 'Only the original sender or group admins can revoke messages',
      };
    }
  }

  /**
   * Process a batch of revoke messages (e.g., from history)
   * Returns results for each message
   */
  async processBatchRevokeMessages(
    envelopes: Array<{ envelope: Uint8Array; sessionKey: Uint8Array }>
  ): Promise<RevokeProcessResult[]> {
    const results: RevokeProcessResult[] = [];

    for (const { envelope, sessionKey } of envelopes) {
      try {
        const result = await this.processRevokeMessage(envelope, sessionKey);
        results.push(result);
      } catch (error) {
        // Log error but continue processing other messages
        console.error('Error processing revoke message:', error);
      }
    }

    return results;
  }

  /**
   * Check if a message has been revoked
   */
  async isMessageRevoked(messageId: string): Promise<boolean> {
    return this.storage.isRevoked(messageId);
  }

  /**
   * Get revocation info for a message
   */
  async getRevocationInfo(messageId: string) {
    return this.storage.getRevocationInfo(messageId);
  }
}
