// Waku adapter type definitions

/**
 * Configuration for WakuAdapter
 */
export interface WakuAdapterConfig {
  /** Bootstrap nodes to connect to */
  bootstrapNodes?: string[];
  /** Use light mode (LightPush + Filter) instead of Relay */
  lightMode?: boolean;
  /** Use mock mode for local development (no network required) */
  mockMode?: boolean;
  /** PubSub topic for message routing */
  pubsubTopic?: string;
}

/**
 * Options for querying historical messages
 */
export interface QueryOptions {
  /** Start time filter (Unix timestamp in ms) */
  startTime?: number;
  /** End time filter (Unix timestamp in ms) */
  endTime?: number;
  /** Maximum number of messages to return */
  pageSize?: number;
  /** Cursor for pagination */
  cursor?: Uint8Array;
}

/**
 * Result from a history query
 */
export interface QueryResult {
  /** Retrieved messages */
  messages: Uint8Array[];
  /** Cursor for next page, undefined if no more pages */
  cursor?: Uint8Array;
}

/**
 * Handler for incoming messages
 */
export type MessageCallback = (payload: Uint8Array) => void;

/**
 * Function to unsubscribe from a topic
 */
export type WakuUnsubscribe = () => void;

/**
 * Connection state of the adapter
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * Event handler for connection state changes
 */
export type ConnectionStateHandler = (state: ConnectionState) => void;

/**
 * WakuAdapter interface - abstraction over Waku protocols
 * 
 * Provides a unified interface for both Relay and Light modes,
 * handling message publishing, subscription, and history queries.
 */
export interface WakuAdapter {
  /**
   * Connect to the Waku network
   * @throws Error if connection fails
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the Waku network
   */
  disconnect(): Promise<void>;

  /**
   * Check if currently connected to the network
   */
  isConnected(): boolean;

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState;

  /**
   * Publish a message to a content topic
   * @param contentTopic - The content topic to publish to
   * @param payload - The message payload
   * @throws Error if publish fails
   */
  publish(contentTopic: string, payload: Uint8Array): Promise<void>;

  /**
   * Subscribe to messages on a content topic
   * @param contentTopic - The content topic to subscribe to
   * @param handler - Callback for received messages
   * @returns Function to unsubscribe
   */
  subscribe(contentTopic: string, handler: MessageCallback): Promise<WakuUnsubscribe>;

  /**
   * Query historical messages from Store protocol
   * @param contentTopic - The content topic to query
   * @param options - Query options (time range, pagination)
   * @returns Query result with messages and optional cursor
   */
  queryHistory(contentTopic: string, options?: QueryOptions): Promise<QueryResult>;

  /**
   * Register a handler for connection state changes
   * @param handler - Callback for state changes
   * @returns Function to unregister the handler
   */
  onConnectionStateChange(handler: ConnectionStateHandler): WakuUnsubscribe;
}
