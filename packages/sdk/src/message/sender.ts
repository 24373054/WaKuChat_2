/**
 * MessageSender - Handles message sending with retry mechanism
 * Implements exponential backoff with configurable max retries
 */

import type { WakuAdapter } from '../waku/types.js';

export interface MessageSenderConfig {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelay?: number;
  /** Maximum delay cap in milliseconds */
  maxDelay?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY = 1000; // 1 second
const DEFAULT_MAX_DELAY = 30000; // 30 seconds

/**
 * Error thrown when message sending fails after all retries
 */
export class SendError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = 'SendError';
  }
}

/**
 * MessageSender handles reliable message delivery with retry logic
 */
export class MessageSender {
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;

  constructor(config: MessageSenderConfig = {}) {
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelay = config.baseDelay ?? DEFAULT_BASE_DELAY;
    this.maxDelay = config.maxDelay ?? DEFAULT_MAX_DELAY;
  }

  /**
   * Send a message with automatic retry on failure
   * @param adapter - Waku adapter to use for sending
   * @param contentTopic - Content topic to publish to
   * @param payload - Message payload
   * @throws SendError if all retries fail
   */
  async send(
    adapter: WakuAdapter,
    contentTopic: string,
    payload: Uint8Array
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await adapter.publish(contentTopic, payload);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        
        // Don't wait after the last attempt
        if (attempt < this.maxRetries - 1) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new SendError(
      `Failed to send message after ${this.maxRetries} attempts: ${lastError?.message}`,
      this.maxRetries,
      lastError!
    );
  }

  /**
   * Calculate delay for a given attempt using exponential backoff
   * @param attempt - Zero-based attempt number
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^attempt
    const delay = this.baseDelay * Math.pow(2, attempt);
    // Add jitter (±10%) to prevent thundering herd
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    // Cap at maxDelay
    return Math.min(delay + jitter, this.maxDelay);
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
