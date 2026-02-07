/**
 * ECDH key exchange and HKDF key derivation
 * Uses @noble/secp256k1 for ECDH and @noble/hashes for HKDF
 */

import * as secp256k1 from '@noble/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

const SESSION_KEY_INFO = 'encrypted-chat-session-key';
const SESSION_KEY_LENGTH = 32; // 256 bits for AES-256

/**
 * Compute ECDH shared secret
 * @param privateKey - Our private key
 * @param publicKey - Peer's public key
 * @returns 32-byte shared secret
 */
export function computeSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  const sharedPoint = secp256k1.getSharedSecret(privateKey, publicKey, true);
  // The shared secret is the x-coordinate of the shared point
  // For compressed format, skip the first byte (prefix)
  return sharedPoint.slice(1);
}

/**
 * Derive a session key using HKDF-SHA256
 * @param sharedSecret - ECDH shared secret
 * @param salt - Salt for HKDF (e.g., conversation ID)
 * @param info - Context info (default: 'encrypted-chat-session-key')
 * @param length - Output key length in bytes (default: 32)
 * @returns Derived key
 */
export function deriveKey(
  sharedSecret: Uint8Array,
  salt: Uint8Array | string,
  info: string = SESSION_KEY_INFO,
  length: number = SESSION_KEY_LENGTH
): Uint8Array {
  const saltBytes = typeof salt === 'string' 
    ? new TextEncoder().encode(salt) 
    : salt;
  const infoBytes = new TextEncoder().encode(info);
  
  return hkdf(sha256, sharedSecret, saltBytes, infoBytes, length);
}

/**
 * Derive a session key for direct messaging between two users
 * @param myPrivateKey - Our private key
 * @param peerPublicKey - Peer's public key
 * @param conversationId - Unique conversation identifier
 * @returns 32-byte session key
 */
export function deriveSessionKey(
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array,
  conversationId: string
): Uint8Array {
  const sharedSecret = computeSharedSecret(myPrivateKey, peerPublicKey);
  return deriveKey(sharedSecret, conversationId);
}

/**
 * Generate a deterministic conversation ID from two user IDs
 * Sorts the IDs to ensure both parties derive the same ID
 * @param userId1 - First user ID
 * @param userId2 - Second user ID
 * @returns Conversation ID (hex string)
 */
export function deriveConversationId(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  const combined = sorted.join(':');
  const encoder = new TextEncoder();
  const hash = sha256(encoder.encode(combined));
  // Return first 16 bytes as hex (32 characters)
  return Array.from(hash.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive multiple keys from a single shared secret
 * Useful for deriving separate encryption and MAC keys
 * @param sharedSecret - ECDH shared secret
 * @param salt - Salt for HKDF
 * @param keyLengths - Array of key lengths to derive
 * @returns Array of derived keys
 */
export function deriveMultipleKeys(
  sharedSecret: Uint8Array,
  salt: Uint8Array | string,
  keyLengths: number[]
): Uint8Array[] {
  const totalLength = keyLengths.reduce((sum, len) => sum + len, 0);
  const saltBytes = typeof salt === 'string'
    ? new TextEncoder().encode(salt)
    : salt;
  
  const derivedMaterial = hkdf(
    sha256,
    sharedSecret,
    saltBytes,
    new TextEncoder().encode(SESSION_KEY_INFO),
    totalLength
  );
  
  const keys: Uint8Array[] = [];
  let offset = 0;
  for (const length of keyLengths) {
    keys.push(derivedMaterial.slice(offset, offset + length));
    offset += length;
  }
  
  return keys;
}
