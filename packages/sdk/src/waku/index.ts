// Waku adapter module exports

import type { WakuAdapter, WakuAdapterConfig } from './types.js';
import { LightWakuAdapter } from './light-adapter.js';
import { RelayWakuAdapter } from './relay-adapter.js';
import { MockWakuAdapter } from './mock-adapter.js';

// Types
export type {
  WakuAdapter,
  WakuAdapterConfig,
  QueryOptions,
  QueryResult,
  MessageCallback,
  WakuUnsubscribe,
  ConnectionState,
  ConnectionStateHandler,
} from './types.js';

// Adapters
export { BaseWakuAdapter } from './base-adapter.js';
export { LightWakuAdapter } from './light-adapter.js';
export { RelayWakuAdapter } from './relay-adapter.js';
export { MockWakuAdapter } from './mock-adapter.js';

// Topic utilities
export {
  DEFAULT_PUBSUB_TOPIC,
  CONTENT_TOPIC_VERSION,
  generateContentTopic,
  generateDMConversationId,
  generateDMContentTopic,
  generateGroupContentTopic,
  generateSystemContentTopic,
  parseContentTopic,
  isValidContentTopic,
} from './topics.js';
export type { ContentTopicType } from './topics.js';

// Store utilities
export {
  queryStoreMessages,
  queryAllStoreMessages,
  queryStoreWithCallback,
} from './store.js';

/**
 * Create a Waku adapter based on configuration
 * 
 * @param config - Adapter configuration
 * @returns Appropriate adapter instance
 */
export function createWakuAdapter(config: WakuAdapterConfig = {}): WakuAdapter {
  console.log('createWakuAdapter called with config:', {
    mockMode: config.mockMode,
    lightMode: config.lightMode,
    bootstrapNodes: config.bootstrapNodes,
  });
  
  // Mock mode for local development/testing
  if (config.mockMode) {
    console.log('Using Mock Waku adapter (local mode, no network required)');
    return new MockWakuAdapter(config);
  }
  
  if (config.lightMode !== false) {
    // Default to light mode for better compatibility
    return new LightWakuAdapter(config);
  }
  return new RelayWakuAdapter(config);
}
