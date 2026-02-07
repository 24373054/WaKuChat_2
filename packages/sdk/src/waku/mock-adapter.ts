/**
 * Mock Waku adapter for local development and testing
 * Uses in-memory message storage and BroadcastChannel for cross-tab communication
 */

import type {
  WakuAdapter,
  WakuAdapterConfig,
  QueryOptions,
  QueryResult,
  MessageCallback,
  WakuUnsubscribe,
  ConnectionState,
  ConnectionStateHandler,
} from './types.js';
import { DEFAULT_PUBSUB_TOPIC } from './topics.js';

interface StoredMessage {
  payload: Uint8Array;
  timestamp: number;
  contentTopic: string;
}

/**
 * Mock Waku adapter that works entirely in-memory
 * Supports cross-tab communication via BroadcastChannel (browser) or EventEmitter (Node.js)
 */
export class MockWakuAdapter implements WakuAdapter {
  private pubsubTopic: string;
  private connectionState: ConnectionState = 'disconnected';
  private connectionHandlers: Set<ConnectionStateHandler> = new Set();
  private subscriptions: Map<string, Set<MessageCallback>> = new Map();
  private messageStore: StoredMessage[] = [];
  private broadcastChannel: BroadcastChannel | null = null;
  private maxStoreSize = 1000;

  constructor(config: WakuAdapterConfig = {}) {
    this.pubsubTopic = config.pubsubTopic ?? DEFAULT_PUBSUB_TOPIC;
  }

  async connect(): Promise<void> {
    if (this.connectionState === 'connected') {
      return;
    }

    this.setConnectionState('connecting');

    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Set up cross-tab communication if in browser
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel('waku-mock-channel');
      this.broadcastChannel.onmessage = (event) => {
        this.handleBroadcastMessage(event.data);
      };
    }

    console.log('✓ Mock Waku adapter connected (local mode)');
    this.setConnectionState('connected');
  }

  async disconnect(): Promise<void> {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    this.subscriptions.clear();
    this.setConnectionState('disconnected');
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async publish(contentTopic: string, payload: Uint8Array): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    const message: StoredMessage = {
      payload: new Uint8Array(payload),
      timestamp: Date.now(),
      contentTopic,
    };

    // Store message locally
    this.storeMessage(message);

    // Notify local subscribers
    this.notifySubscribers(contentTopic, payload);

    // Broadcast to other tabs/windows
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'message',
        contentTopic,
        payload: Array.from(payload),
        timestamp: message.timestamp,
      });
    }
  }

  async subscribe(contentTopic: string, handler: MessageCallback): Promise<WakuUnsubscribe> {
    if (!this.subscriptions.has(contentTopic)) {
      this.subscriptions.set(contentTopic, new Set());
    }
    this.subscriptions.get(contentTopic)!.add(handler);

    return () => {
      const handlers = this.subscriptions.get(contentTopic);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscriptions.delete(contentTopic);
        }
      }
    };
  }

  async queryHistory(contentTopic: string, options: QueryOptions = {}): Promise<QueryResult> {
    let messages = this.messageStore
      .filter(m => m.contentTopic === contentTopic)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Apply time filters
    if (options.startTime) {
      messages = messages.filter(m => m.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      messages = messages.filter(m => m.timestamp <= options.endTime!);
    }

    // Apply page size
    if (options.pageSize) {
      messages = messages.slice(0, options.pageSize);
    }

    return {
      messages: messages.map(m => m.payload),
    };
  }

  onConnectionStateChange(handler: ConnectionStateHandler): WakuUnsubscribe {
    this.connectionHandlers.add(handler);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      for (const handler of this.connectionHandlers) {
        try {
          handler(state);
        } catch (error) {
          console.error('Connection state handler error:', error);
        }
      }
    }
  }

  private storeMessage(message: StoredMessage): void {
    this.messageStore.push(message);
    // Limit store size
    if (this.messageStore.length > this.maxStoreSize) {
      this.messageStore = this.messageStore.slice(-this.maxStoreSize);
    }
  }

  private notifySubscribers(contentTopic: string, payload: Uint8Array): void {
    const handlers = this.subscriptions.get(contentTopic);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (error) {
          console.error('Subscriber handler error:', error);
        }
      }
    }
  }

  private handleBroadcastMessage(data: { type: string; contentTopic: string; payload: number[]; timestamp: number }): void {
    if (data.type === 'message') {
      const payload = new Uint8Array(data.payload);
      
      // Store the message
      this.storeMessage({
        payload,
        timestamp: data.timestamp,
        contentTopic: data.contentTopic,
      });

      // Notify subscribers
      this.notifySubscribers(data.contentTopic, payload);
    }
  }

  /**
   * Clear all stored messages (useful for testing)
   */
  clearStore(): void {
    this.messageStore = [];
  }

  /**
   * Get the number of stored messages
   */
  getStoreSize(): number {
    return this.messageStore.length;
  }

  /**
   * Get the pubsub topic
   */
  getPubsubTopic(): string {
    return this.pubsubTopic;
  }
}
