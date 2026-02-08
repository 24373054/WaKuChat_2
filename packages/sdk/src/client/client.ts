/**
 * ChatClient - Main entry point for the Waku Encrypted Chat SDK
 * Integrates all modules to provide a unified API for encrypted messaging
 */

import { Identity } from '../identity/identity.js';
import { InMemoryStorageBackend, type StorageBackend } from '../identity/storage.js';
import { Conversation } from '../conversation/conversation.js';
import { ConversationManager, InMemoryPublicKeyResolver } from '../conversation/manager.js';
import type { GroupInviteData, GroupMember } from '../conversation/types.js';
import {
  createWakuAdapter,
  generateContentTopic,
  type WakuAdapter,
  type WakuUnsubscribe,
  type ConnectionState,
} from '../waku/index.js';
import {
  generateMessageId,
  serializeChatMessage,
  serializeTextPayload,
  deserializeChatMessage,
  deserializeTextPayload,
  createEncryptedEnvelope,
  openEncryptedEnvelope,
  signMessage,
  verifyMessageSignature,
  DedupeCache,
  MessageSender,
  MessageStorage,
  createRevokeMessage,
  isRevokeMessage,
  deserializeRevokePayload,
} from '../message/index.js';
import type { Message, MessageHandler, Unsubscribe, MessageType } from '../types.js';
import type { ChatClientConfig, HistoryOptions, IChatClient } from './types.js';

/**
 * ChatClient implementation
 */
export class ChatClient implements IChatClient {
  private identity: Identity | null = null;
  private wakuAdapter: WakuAdapter | null = null;
  private conversationManager: ConversationManager | null = null;
  private messageStorage: MessageStorage | null = null;
  private publicKeyResolver: InMemoryPublicKeyResolver;
  private storageBackend: StorageBackend;
  private dedupeCache: DedupeCache;
  private messageSender: MessageSender;
  private subscriptions: Map<string, WakuUnsubscribe> = new Map();
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private config: ChatClientConfig = {};
  private initialized = false;

  constructor(storageBackend?: StorageBackend) {
    this.storageBackend = storageBackend ?? new InMemoryStorageBackend();
    this.publicKeyResolver = new InMemoryPublicKeyResolver();
    this.dedupeCache = new DedupeCache();
    this.messageSender = new MessageSender();
  }


  /**
   * Initialize the ChatClient
   * Connects to the Waku network and sets up internal components
   */
  async init(config: ChatClientConfig = {}): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.config = config;

    // Create Waku adapter
    this.wakuAdapter = createWakuAdapter({
      bootstrapNodes: config.bootstrapNodes,
      lightMode: config.lightMode,
      mockMode: config.mockMode,
    });

    // Set up connection state handler
    this.wakuAdapter.onConnectionStateChange((state: ConnectionState) => {
      if (config.onConnectionChange) {
        config.onConnectionChange(state === 'connected');
      }
    });

    // Connect to Waku network
    try {
      await this.wakuAdapter.connect();
    } catch (error) {
      if (config.onError) {
        config.onError(error as Error);
      }
      throw error;
    }

    // Initialize message storage
    this.messageStorage = new MessageStorage(this.storageBackend);

    this.initialized = true;
  }

  /**
   * Destroy the ChatClient
   * Disconnects from the network and cleans up resources
   */
  async destroy(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Unsubscribe from all topics
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }
    this.subscriptions.clear();
    this.messageHandlers.clear();

    // Disconnect from Waku
    if (this.wakuAdapter) {
      await this.wakuAdapter.disconnect();
      this.wakuAdapter = null;
    }

    // Clear caches
    this.dedupeCache.clear();

    this.initialized = false;
  }

  /**
   * Check if the client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Create a new identity
   */
  createIdentity(): Identity {
    const identity = Identity.create();
    this.setIdentity(identity);
    return identity;
  }

  /**
   * Load an identity from encrypted JSON
   */
  async loadIdentity(data: string, password: string): Promise<Identity> {
    const identity = await Identity.import(data, password);
    this.setIdentity(identity);
    return identity;
  }

  /**
   * Export the current identity to encrypted JSON
   */
  async exportIdentity(password: string): Promise<string> {
    if (!this.identity) {
      throw new Error('No identity set');
    }
    return this.identity.export(password);
  }

  /**
   * Get the current identity
   */
  getIdentity(): Identity | null {
    return this.identity;
  }

  /**
   * Set the identity and initialize conversation manager
   */
  async setIdentity(identity: Identity): Promise<void> {
    this.identity = identity;
    this.conversationManager = new ConversationManager(
      identity,
      this.storageBackend,
      this.publicKeyResolver
    );
    // Register own public key
    this.publicKeyResolver.setPublicKey(identity.userId, identity.publicKey);
    
    // Load saved conversations from storage
    await this.conversationManager.init();
    console.log('Loaded', this.conversationManager.getAllConversations().length, 'conversations from storage');
  }


  /**
   * Create a direct (1:1) conversation
   */
  async createDirectConversation(
    peerUserId: string,
    peerPublicKey: Uint8Array
  ): Promise<Conversation> {
    this.ensureInitialized();
    this.ensureIdentity();

    // Register peer's public key
    this.publicKeyResolver.setPublicKey(peerUserId, peerPublicKey);

    return this.conversationManager!.createDirectConversationWithKey(peerUserId, peerPublicKey);
  }

  /**
   * Create a group conversation
   */
  async createGroupConversation(name: string): Promise<Conversation> {
    this.ensureInitialized();
    this.ensureIdentity();

    return this.conversationManager!.createGroupConversation(name);
  }

  /**
   * Join a group conversation from invite data
   */
  async joinGroupConversation(inviteData: GroupInviteData): Promise<Conversation> {
    this.ensureInitialized();
    this.ensureIdentity();

    return this.conversationManager!.joinGroupConversation(inviteData);
  }

  /**
   * Leave a conversation
   */
  async leaveConversation(conversationId: string): Promise<void> {
    this.ensureInitialized();
    this.ensureIdentity();

    // Unsubscribe from the conversation topic
    const unsubscribe = this.subscriptions.get(conversationId);
    if (unsubscribe) {
      unsubscribe();
      this.subscriptions.delete(conversationId);
    }
    this.messageHandlers.delete(conversationId);

    await this.conversationManager!.leaveGroup(conversationId);
  }

  /**
   * Get all conversations
   */
  getConversations(): Conversation[] {
    if (!this.conversationManager) {
      return [];
    }
    return this.conversationManager.getAllConversations();
  }

  /**
   * Get a conversation by ID
   */
  getConversation(conversationId: string): Conversation | undefined {
    return this.conversationManager?.getConversation(conversationId);
  }

  /**
   * Register a public key for a user
   */
  registerPublicKey(userId: string, publicKey: Uint8Array): void {
    this.publicKeyResolver.setPublicKey(userId, publicKey);
    if (this.conversationManager) {
      this.conversationManager.registerPublicKey(userId, publicKey);
    }
  }


  /**
   * Send a message to a conversation
   * Encrypts, signs, and sends the message
   * @returns The message ID
   */
  async sendMessage(conversationId: string, content: string): Promise<string> {
    this.ensureInitialized();
    this.ensureIdentity();

    const conversation = this.conversationManager!.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const timestamp = Date.now();
    const messageId = generateMessageId(timestamp, this.identity!.userId);

    // Serialize the text payload
    const payload = serializeTextPayload(content);
    console.log('[Debug] Text payload size:', payload.length);

    // Create the chat message
    const chatMessage = serializeChatMessage({
      messageId,
      senderId: this.identity!.userId,
      conversationId,
      convType: conversation.type,
      type: 'TEXT' as MessageType,
      timestamp,
      payload,
    });
    console.log('[Debug] Chat message size:', chatMessage.length);

    // Sign the message
    const signature = await signMessage(
      {
        messageId,
        senderId: this.identity!.userId,
        conversationId,
        timestamp,
        messageType: 'TEXT' as MessageType,
        payload,
      },
      this.identity!.privateKey
    );
    console.log('[Debug] Signature size:', signature.length);

    // Create encrypted envelope
    const envelope = await createEncryptedEnvelope({
      payload: chatMessage,
      sessionKey: conversation.sessionKey,
      senderId: this.identity!.userId,
      timestamp,
      signature,
    });
    console.log('[Debug] Envelope size:', envelope.length);

    // Generate content topic
    const contentTopic = this.getContentTopic(conversation);

    // Send with retry
    await this.messageSender.send(this.wakuAdapter!, contentTopic, envelope);

    // Store the message locally
    const message: Message = {
      id: messageId,
      conversationId,
      senderId: this.identity!.userId,
      type: 'TEXT',
      content,
      timestamp,
      status: 'sent',
      signature,
      verified: true,
    };
    await this.messageStorage!.saveMessage(message);

    // Add to dedupe cache
    this.dedupeCache.add(messageId);

    return messageId;
  }

  /**
   * Revoke a message
   * Sends a tombstone control message to mark the message as revoked
   */
  async revokeMessage(
    conversationId: string,
    messageId: string,
    reason?: string
  ): Promise<void> {
    this.ensureInitialized();
    this.ensureIdentity();

    const conversation = this.conversationManager!.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Check revoke permission
    const originalMessage = await this.messageStorage!.loadMessage(conversationId, messageId);
    if (originalMessage) {
      if (!conversation.canRevoke(this.identity!.userId, originalMessage.senderId)) {
        throw new Error('You do not have permission to revoke this message');
      }
    }

    // Create revoke message
    const { envelope } = await createRevokeMessage({
      targetMessageId: messageId,
      conversationId,
      convType: conversation.type,
      revokerId: this.identity!.userId,
      privateKey: this.identity!.privateKey,
      sessionKey: conversation.sessionKey,
      reason,
    });

    // Generate content topic
    const contentTopic = this.getContentTopic(conversation);

    // Send with retry
    await this.messageSender.send(this.wakuAdapter!, contentTopic, envelope);

    // Mark as revoked locally
    await this.messageStorage!.markAsRevoked(messageId, this.identity!.userId, reason);
  }

  /**
   * Delete a message locally
   * Only affects local storage, does not send any network message
   */
  async deleteLocalMessage(_conversationId: string, messageId: string): Promise<void> {
    this.ensureInitialized();
    await this.messageStorage!.deleteLocalMessage(messageId);
  }


  /**
   * Subscribe to messages in a conversation
   * Decrypts, verifies, and calls the handler for each message
   */
  async subscribe(conversationId: string, handler: MessageHandler): Promise<Unsubscribe> {
    this.ensureInitialized();
    this.ensureIdentity();

    const conversation = this.conversationManager!.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Add handler to the set
    if (!this.messageHandlers.has(conversationId)) {
      this.messageHandlers.set(conversationId, new Set());
    }
    this.messageHandlers.get(conversationId)!.add(handler);

    // If already subscribed to this topic, just add the handler
    if (this.subscriptions.has(conversationId)) {
      return () => {
        const handlers = this.messageHandlers.get(conversationId);
        if (handlers) {
          handlers.delete(handler);
        }
      };
    }

    // Generate content topic
    const contentTopic = this.getContentTopic(conversation);

    // Subscribe to the topic
    const wakuUnsubscribe = await this.wakuAdapter!.subscribe(
      contentTopic,
      async (payload: Uint8Array) => {
        await this.handleIncomingMessage(conversationId, payload);
      }
    );

    this.subscriptions.set(conversationId, wakuUnsubscribe);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(conversationId);
      if (handlers) {
        handlers.delete(handler);
        // If no more handlers, unsubscribe from the topic
        if (handlers.size === 0) {
          wakuUnsubscribe();
          this.subscriptions.delete(conversationId);
          this.messageHandlers.delete(conversationId);
        }
      }
    };
  }

  /**
   * Handle an incoming message from the network
   */
  private async handleIncomingMessage(
    conversationId: string,
    payload: Uint8Array
  ): Promise<void> {
    const conversation = this.conversationManager!.getConversation(conversationId);
    if (!conversation) {
      console.log('[Debug] Conversation not found:', conversationId);
      return;
    }

    try {
      console.log('[Debug] Raw payload size:', payload.length, 'first bytes:', Array.from(payload.slice(0, 20)));
      
      // Open the encrypted envelope
      const decoded = await openEncryptedEnvelope(payload, conversation.sessionKey);
      console.log('[Debug] Envelope decoded, senderId:', decoded.senderId);
      console.log('[Debug] Decrypted payload size:', decoded.payload.length, 'first bytes:', Array.from(decoded.payload.slice(0, 20)));

      // Deserialize the chat message
      const chatMessage = deserializeChatMessage(decoded.payload);
      console.log('[Debug] Message deserialized, messageId:', chatMessage.messageId);

      // Check for duplicates
      if (this.dedupeCache.checkAndAdd(chatMessage.messageId)) {
        console.log('[Debug] Duplicate message, skipping');
        return; // Duplicate message
      }

      // Verify signature
      const senderPublicKey = await this.publicKeyResolver.getPublicKey(decoded.senderId);
      let verified = false;
      if (senderPublicKey) {
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
          senderPublicKey
        );
      }

      // Handle revoke messages
      if (isRevokeMessage(chatMessage.type)) {
        await this.handleRevokeMessage(chatMessage, decoded.senderId, verified);
        return;
      }

      // Deserialize content based on type
      let content = '';
      if (chatMessage.type === 'TEXT') {
        content = deserializeTextPayload(chatMessage.payload);
      }

      // Create message object
      const message: Message = {
        id: chatMessage.messageId,
        conversationId: chatMessage.conversationId,
        senderId: chatMessage.senderId,
        type: chatMessage.type,
        content,
        timestamp: chatMessage.timestamp,
        status: 'sent',
        signature: decoded.signature,
        verified,
      };

      // Store the message
      await this.messageStorage!.saveMessage(message);

      // Notify handlers
      const handlers = this.messageHandlers.get(conversationId);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(message);
          } catch (error) {
            console.error('Message handler error:', error);
          }
        }
      }
    } catch (error) {
      // Log decode errors for debugging
      console.log('[Debug] Failed to decode message:', (error as Error).message);
      if (this.config.onError) {
        this.config.onError(error as Error);
      }
    }
  }

  /**
   * Handle a revoke message
   */
  private async handleRevokeMessage(
    chatMessage: { messageId: string; senderId: string; conversationId: string; payload: Uint8Array },
    senderId: string,
    verified: boolean
  ): Promise<void> {
    if (!verified) {
      console.warn('Ignoring revoke message with invalid signature');
      return;
    }

    const conversation = this.conversationManager!.getConversation(chatMessage.conversationId);
    if (!conversation) {
      return;
    }

    // Deserialize revoke payload
    const revokePayload = deserializeRevokePayload(chatMessage.payload);
    const targetMessageId = revokePayload.targetMessageId;

    // Get original message to check permission
    const originalMessage = await this.messageStorage!.loadMessage(
      chatMessage.conversationId,
      targetMessageId
    );

    // Validate revoke permission (only if we have the original message)
    if (originalMessage) {
      if (!conversation.canRevoke(senderId, originalMessage.senderId)) {
        console.warn('Ignoring revoke message: insufficient permission');
        return;
      }
    }

    // Mark as revoked in storage
    await this.messageStorage!.markAsRevoked(
      targetMessageId,
      senderId,
      revokePayload.reason
    );

    // Always notify handlers - even if we don't have the original message
    // This ensures the UI can update if it has the message in memory
    const handlers = this.messageHandlers.get(chatMessage.conversationId);
    if (handlers) {
      const revokedMessage: Message = {
        id: targetMessageId,
        conversationId: chatMessage.conversationId,
        senderId: originalMessage?.senderId || senderId,
        type: 'TEXT',
        content: '',
        timestamp: originalMessage?.timestamp || Date.now(),
        status: 'revoked',
        signature: originalMessage?.signature || new Uint8Array(),
        verified: true,
      };
      for (const handler of handlers) {
        try {
          handler(revokedMessage);
        } catch (error) {
          console.error('Message handler error:', error);
        }
      }
    }
  }


  /**
   * Fetch history messages from the Store protocol
   * Decrypts, verifies, and merges revocation status
   */
  async fetchHistory(
    conversationId: string,
    options: HistoryOptions = {}
  ): Promise<Message[]> {
    this.ensureInitialized();
    this.ensureIdentity();

    const conversation = this.conversationManager!.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Generate content topic
    const contentTopic = this.getContentTopic(conversation);

    // Query history from Store
    const result = await this.wakuAdapter!.queryHistory(contentTopic, {
      startTime: options.startTime,
      endTime: options.endTime,
      pageSize: options.limit,
    });

    const messages: Message[] = [];
    const revokedMessageIds = new Set<string>();

    // First pass: collect all revoke messages
    for (const payload of result.messages) {
      try {
        const decoded = await openEncryptedEnvelope(payload, conversation.sessionKey);
        const chatMessage = deserializeChatMessage(decoded.payload);

        if (isRevokeMessage(chatMessage.type)) {
          const revokePayload = deserializeRevokePayload(chatMessage.payload);
          revokedMessageIds.add(revokePayload.targetMessageId);

          // Mark as revoked in storage
          await this.messageStorage!.markAsRevoked(
            revokePayload.targetMessageId,
            chatMessage.senderId,
            revokePayload.reason
          );
        }
      } catch (error) {
        // Skip messages that can't be decoded
        continue;
      }
    }

    // Second pass: process all messages
    for (const payload of result.messages) {
      try {
        const decoded = await openEncryptedEnvelope(payload, conversation.sessionKey);
        const chatMessage = deserializeChatMessage(decoded.payload);

        // Skip revoke messages in the output
        if (isRevokeMessage(chatMessage.type)) {
          continue;
        }

        // Check for duplicates
        if (this.dedupeCache.isDuplicate(chatMessage.messageId)) {
          continue;
        }
        this.dedupeCache.add(chatMessage.messageId);

        // Verify signature
        const senderPublicKey = await this.publicKeyResolver.getPublicKey(decoded.senderId);
        let verified = false;
        if (senderPublicKey) {
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
            senderPublicKey
          );
        }

        // Deserialize content based on type
        let content = '';
        if (chatMessage.type === 'TEXT') {
          content = deserializeTextPayload(chatMessage.payload);
        }

        // Check if revoked
        const isRevoked = revokedMessageIds.has(chatMessage.messageId) ||
          await this.messageStorage!.isRevoked(chatMessage.messageId);

        // Create message object
        const message: Message = {
          id: chatMessage.messageId,
          conversationId: chatMessage.conversationId,
          senderId: chatMessage.senderId,
          type: chatMessage.type,
          content: isRevoked ? '' : content,
          timestamp: chatMessage.timestamp,
          status: isRevoked ? 'revoked' : 'sent',
          signature: decoded.signature,
          verified,
        };

        // Store the message
        await this.messageStorage!.saveMessage(message);

        messages.push(message);
      } catch {
        // Skip messages that can't be decoded (from other apps)
        continue;
      }
    }

    // Sort by timestamp
    messages.sort((a, b) => a.timestamp - b.timestamp);

    return messages;
  }


  /**
   * Invite a user to a group
   */
  async inviteToGroup(
    groupId: string,
    userId: string,
    userPublicKey: Uint8Array
  ): Promise<GroupInviteData> {
    this.ensureInitialized();
    this.ensureIdentity();

    // Register the user's public key
    this.publicKeyResolver.setPublicKey(userId, userPublicKey);

    return this.conversationManager!.createGroupInviteWithKey(groupId, userId, userPublicKey);
  }

  /**
   * Set admin status for a group member
   */
  async setGroupAdmin(
    groupId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<void> {
    this.ensureInitialized();
    this.ensureIdentity();

    await this.conversationManager!.setGroupAdmin(groupId, userId, isAdmin);
  }

  /**
   * Restore a conversation from stored data and session key
   * Useful for CLI/apps that manage their own storage
   */
  async restoreConversation(data: {
    id: string;
    type: 'direct' | 'group';
    name?: string;
    members: string[];
    admins: string[];
    sessionKey: Uint8Array;
    groupKeyVersion?: number;
  }): Promise<Conversation> {
    this.ensureInitialized();
    this.ensureIdentity();

    // Register public keys for members if available
    for (const memberId of data.members) {
      if (memberId !== this.identity!.userId) {
        // The caller should register public keys separately if needed
      }
    }

    return this.conversationManager!.restoreConversation(data);
  }

  /**
   * Get group members
   */
  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    this.ensureInitialized();
    this.ensureIdentity();

    return this.conversationManager!.getGroupMembers(groupId);
  }

  // Helper methods

  /**
   * Ensure the client is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ChatClient not initialized. Call init() first.');
    }
  }

  /**
   * Ensure an identity is set
   */
  private ensureIdentity(): void {
    if (!this.identity) {
      throw new Error('No identity set. Call createIdentity() or loadIdentity() first.');
    }
    if (!this.conversationManager) {
      throw new Error('Conversation manager not initialized');
    }
  }

  /**
   * Get the content topic for a conversation
   */
  private getContentTopic(conversation: Conversation): string {
    const topicType = conversation.type === 'direct' ? 'dm' : 'group';
    return generateContentTopic(topicType, conversation.id);
  }
}
