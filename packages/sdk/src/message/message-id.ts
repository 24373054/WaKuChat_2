/**
 * Message ID generation module
 * Generates unique message IDs using SHA256(timestamp + senderId + random)
 */

import { sha256 } from '@noble/hashes/sha256';

const RANDOM_BYTES_LENGTH = 16;

/**
 * Generate a unique message ID
 * @param timestamp - Message timestamp in milliseconds
 * @param senderId - Sender's user ID
 * @returns Hex-encoded message ID
 */
export function generateMessageId(timestamp: number, senderId: string): string {
  const randomBytes = new Uint8Array(RANDOM_BYTES_LENGTH);
  crypto.getRandomValues(randomBytes);
  
  return generateMessageIdWithRandom(timestamp, senderId, randomBytes);
}

/**
 * Generate a message ID with specific random bytes (for testing)
 * @param timestamp - Message timestamp in milliseconds
 * @param senderId - Sender's user ID
 * @param randomBytes - 16 bytes of random data
 * @returns Hex-encoded message ID
 */
export function generateMessageIdWithRandom(
  timestamp: number,
  senderId: string,
  randomBytes: Uint8Array
): string {
  if (randomBytes.length !== RANDOM_BYTES_LENGTH) {
    throw new Error(`Random bytes must be ${RANDOM_BYTES_LENGTH} bytes`);
  }

  const encoder = new TextEncoder();
  const timestampBytes = encoder.encode(timestamp.toString());
  const senderIdBytes = encoder.encode(senderId);

  // Concatenate: timestamp + senderId + random
  const totalLength = timestampBytes.length + senderIdBytes.length + randomBytes.length;
  const combined = new Uint8Array(totalLength);
  
  let offset = 0;
  combined.set(timestampBytes, offset);
  offset += timestampBytes.length;
  combined.set(senderIdBytes, offset);
  offset += senderIdBytes.length;
  combined.set(randomBytes, offset);

  // Hash and convert to hex
  const hash = sha256(combined);
  return bytesToHex(hash);
}

/**
 * Validate a message ID format
 * @param messageId - Message ID to validate
 * @returns true if valid hex string of correct length
 */
export function isValidMessageId(messageId: string): boolean {
  // SHA256 produces 32 bytes = 64 hex characters
  if (messageId.length !== 64) {
    return false;
  }
  return /^[0-9a-f]+$/i.test(messageId);
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
