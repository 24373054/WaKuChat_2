/**
 * DedupeCache - Message deduplication cache
 * Prevents duplicate message processing based on messageId
 */

export interface DedupeCacheConfig {
  /** Maximum number of entries in the cache */
  maxSize?: number;
  /** Time-to-live for cache entries in milliseconds */
  ttl?: number;
}

const DEFAULT_MAX_SIZE = 10000;
const DEFAULT_TTL = 3600000; // 1 hour

/**
 * Cache for deduplicating messages
 * Uses LRU-like eviction with TTL expiration
 */
export class DedupeCache {
  private cache: Map<string, number> = new Map();
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(config: DedupeCacheConfig = {}) {
    this.maxSize = config.maxSize ?? DEFAULT_MAX_SIZE;
    this.ttl = config.ttl ?? DEFAULT_TTL;
  }

  /**
   * Check if a message ID has been seen before
   * @param messageId - The message ID to check
   * @returns true if the message is a duplicate
   */
  isDuplicate(messageId: string): boolean {
    const timestamp = this.cache.get(messageId);
    if (timestamp === undefined) {
      return false;
    }
    
    // Check if entry has expired
    if (Date.now() - timestamp > this.ttl) {
      this.cache.delete(messageId);
      return false;
    }
    
    return true;
  }

  /**
   * Add a message ID to the cache
   * @param messageId - The message ID to add
   */
  add(messageId: string): void {
    // Clean up if at capacity
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    
    // If still at capacity after cleanup, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(messageId, Date.now());
  }

  /**
   * Check and add in one operation
   * @param messageId - The message ID to check and add
   * @returns true if the message was a duplicate (not added)
   */
  checkAndAdd(messageId: string): boolean {
    if (this.isDuplicate(messageId)) {
      return true;
    }
    this.add(messageId);
    return false;
  }

  /**
   * Remove a message ID from the cache
   * @param messageId - The message ID to remove
   */
  remove(messageId: string): void {
    this.cache.delete(messageId);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, timestamp] of this.cache) {
      if (now - timestamp > this.ttl) {
        this.cache.delete(id);
      }
    }
  }

  /**
   * Evict oldest entries to make room
   * Removes 10% of entries or at least 1
   */
  private evictOldest(): void {
    const toRemove = Math.max(1, Math.floor(this.maxSize * 0.1));
    let removed = 0;
    
    // Map maintains insertion order, so first entries are oldest
    for (const id of this.cache.keys()) {
      if (removed >= toRemove) break;
      this.cache.delete(id);
      removed++;
    }
  }
}
