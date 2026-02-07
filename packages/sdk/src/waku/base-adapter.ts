// Base adapter with shared functionality
import type { LightNode } from '@waku/sdk';
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

/**
 * Abstract base class for Waku adapters
 * Provides common functionality for both Relay and Light modes
 */
export abstract class BaseWakuAdapter implements WakuAdapter {
  protected node: LightNode | null = null;
  protected config: WakuAdapterConfig;
  protected connectionState: ConnectionState = 'disconnected';
  protected connectionHandlers: Set<ConnectionStateHandler> = new Set();
  protected subscriptions: Map<string, WakuUnsubscribe> = new Map();

  constructor(config: WakuAdapterConfig = {}) {
    this.config = {
      pubsubTopic: DEFAULT_PUBSUB_TOPIC,
      ...config,
    };
  }

  /**
   * Create and configure the Waku node
   * Must be implemented by subclasses
   */
  protected abstract createNode(): Promise<LightNode>;

  /**
   * Wait for required protocols to be available
   * Must be implemented by subclasses
   */
  protected abstract waitForProtocols(): Promise<void>;

  /**
   * Publish a message using the appropriate protocol
   * Must be implemented by subclasses
   */
  abstract publish(contentTopic: string, payload: Uint8Array): Promise<void>;

  /**
   * Subscribe to messages using the appropriate protocol
   * Must be implemented by subclasses
   */
  abstract subscribe(contentTopic: string, handler: MessageCallback): Promise<WakuUnsubscribe>;

  async connect(): Promise<void> {
    if (this.connectionState === 'connected') {
      return;
    }

    this.setConnectionState('connecting');

    try {
      // createNode 负责创建、启动节点并等待连接
      this.node = await this.createNode();
      
      // waitForProtocols 不应该抛出错误，只是尽力等待
      await this.waitForProtocols();
      
      // 即使没有完全连接，也设置为 connected 状态
      // 实际的连接状态由 isConnected() 方法检查
      this.setConnectionState('connected');
    } catch (error) {
      // 只有在创建节点或启动失败时才设置为 disconnected
      console.error('Failed to create or start Waku node:', error);
      this.setConnectionState('disconnected');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // Unsubscribe from all topics
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }
    this.subscriptions.clear();

    if (this.node) {
      await this.node.stop();
      this.node = null;
    }

    this.setConnectionState('disconnected');
  }

  isConnected(): boolean {
    return this.node?.isConnected() ?? false;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async queryHistory(contentTopic: string, options: QueryOptions = {}): Promise<QueryResult> {
    if (!this.node) {
      throw new Error('Node not connected');
    }

    const decoder = this.node.createDecoder({ contentTopic });
    const messages: Uint8Array[] = [];

    // Build query options
    const queryOptions: Record<string, unknown> = {};
    
    if (options.startTime || options.endTime) {
      queryOptions.timeFilter = {
        startTime: options.startTime ? new Date(options.startTime) : undefined,
        endTime: options.endTime ? new Date(options.endTime) : undefined,
      };
    }
    
    if (options.pageSize) {
      queryOptions.pageSize = options.pageSize;
    }
    
    if (options.cursor) {
      queryOptions.cursor = options.cursor;
    }

    try {
      for await (const messagePromises of this.node.store.queryGenerator([decoder], queryOptions)) {
        const results = await Promise.all(messagePromises);
        for (const msg of results) {
          if (msg?.payload) {
            messages.push(msg.payload);
          }
        }
      }
    } catch {
      // Store query may fail if no store peers available - this is normal
    }

    return { messages };
  }

  onConnectionStateChange(handler: ConnectionStateHandler): WakuUnsubscribe {
    this.connectionHandlers.add(handler);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  protected setConnectionState(state: ConnectionState): void {
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

  protected getNode(): LightNode {
    if (!this.node) {
      throw new Error('Node not connected');
    }
    return this.node;
  }
}
