// Store protocol utilities for historical message queries
import type { LightNode } from '@waku/sdk';
import type { QueryOptions, QueryResult } from './types.js';

/**
 * Query historical messages from Store protocol
 * 
 * @param node - The Waku light node
 * @param contentTopic - Content topic to query
 * @param options - Query options
 * @returns Query result with messages
 */
export async function queryStoreMessages(
  node: LightNode,
  contentTopic: string,
  options: QueryOptions = {}
): Promise<QueryResult> {
  const decoder = node.createDecoder({ contentTopic });
  const messages: Uint8Array[] = [];
  let lastCursor: Uint8Array | undefined;

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
    for await (const messagePromises of node.store.queryGenerator([decoder], queryOptions)) {
      const results = await Promise.all(messagePromises);
      for (const msg of results) {
        if (msg?.payload) {
          messages.push(msg.payload);
        }
      }
      
      // Break after first page if pageSize is specified
      if (options.pageSize && messages.length >= options.pageSize) {
        break;
      }
    }
  } catch (error) {
    console.warn('Store query failed:', error);
    throw new Error(`Failed to query store: ${(error as Error).message}`);
  }

  return {
    messages,
    cursor: lastCursor,
  };
}

/**
 * Query all historical messages from Store protocol
 * Handles pagination automatically
 * 
 * @param node - The Waku light node
 * @param contentTopic - Content topic to query
 * @param options - Query options (pageSize is used for batch size)
 * @returns All messages matching the query
 */
export async function queryAllStoreMessages(
  node: LightNode,
  contentTopic: string,
  options: Omit<QueryOptions, 'cursor'> = {}
): Promise<Uint8Array[]> {
  const decoder = node.createDecoder({ contentTopic });
  const messages: Uint8Array[] = [];

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

  try {
    for await (const messagePromises of node.store.queryGenerator([decoder], queryOptions)) {
      const results = await Promise.all(messagePromises);
      for (const msg of results) {
        if (msg?.payload) {
          messages.push(msg.payload);
        }
      }
    }
  } catch (error) {
    console.warn('Store query failed:', error);
    throw new Error(`Failed to query store: ${(error as Error).message}`);
  }

  return messages;
}

/**
 * Query messages with callback for each batch
 * Useful for processing large amounts of historical data
 * 
 * @param node - The Waku light node
 * @param contentTopic - Content topic to query
 * @param callback - Callback for each batch of messages
 * @param options - Query options
 */
export async function queryStoreWithCallback(
  node: LightNode,
  contentTopic: string,
  callback: (messages: Uint8Array[]) => void | Promise<void>,
  options: Omit<QueryOptions, 'cursor'> = {}
): Promise<void> {
  const decoder = node.createDecoder({ contentTopic });

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

  try {
    for await (const messagePromises of node.store.queryGenerator([decoder], queryOptions)) {
      const results = await Promise.all(messagePromises);
      const batch: Uint8Array[] = [];
      
      for (const msg of results) {
        if (msg?.payload) {
          batch.push(msg.payload);
        }
      }
      
      if (batch.length > 0) {
        await callback(batch);
      }
    }
  } catch (error) {
    console.warn('Store query failed:', error);
    throw new Error(`Failed to query store: ${(error as Error).message}`);
  }
}
