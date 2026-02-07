/**
 * ECDSA signing and verification using secp256k1
 * Uses @noble/secp256k1 for cryptographic operations
 * 
 * Note: Uses compact signature format (64 bytes: r || s) instead of DER
 */

import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

/**
 * Sign data using ECDSA with secp256k1
 * @param data - Data to sign
 * @param privateKey - 32-byte private key
 * @returns 64-byte compact signature (r || s)
 */
export async function sign(data: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  const hash = sha256(data);
  const signature = await secp256k1.signAsync(hash, privateKey);
  return signature.toCompactRawBytes();
}

/**
 * Sign a message hash directly (when data is already hashed)
 * @param hash - 32-byte hash to sign
 * @param privateKey - 32-byte private key
 * @returns 64-byte compact signature (r || s)
 */
export async function signHash(hash: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  if (hash.length !== 32) {
    throw new Error('Hash must be 32 bytes');
  }
  const signature = await secp256k1.signAsync(hash, privateKey);
  return signature.toCompactRawBytes();
}

/**
 * Verify an ECDSA signature
 * @param data - Original data that was signed
 * @param signature - 64-byte compact signature (r || s)
 * @param publicKey - Public key of the signer
 * @returns true if signature is valid
 */
export function verify(
  data: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    const hash = sha256(data);
    const sig = secp256k1.Signature.fromCompact(signature);
    return secp256k1.verify(sig, hash, publicKey);
  } catch {
    return false;
  }
}

/**
 * Verify a signature against a pre-computed hash
 * @param hash - 32-byte hash that was signed
 * @param signature - 64-byte compact signature (r || s)
 * @param publicKey - Public key of the signer
 * @returns true if signature is valid
 */
export function verifyHash(
  hash: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    if (hash.length !== 32) {
      return false;
    }
    const sig = secp256k1.Signature.fromCompact(signature);
    return secp256k1.verify(sig, hash, publicKey);
  } catch {
    return false;
  }
}

/**
 * Create a signature data hash for message signing
 * Combines message fields into a single hash for signing
 */
export function createSignatureData(
  messageId: string,
  senderId: string,
  conversationId: string,
  timestamp: number,
  messageType: string,
  payloadHash: Uint8Array
): Uint8Array {
  const encoder = new TextEncoder();
  const parts = [
    encoder.encode(messageId),
    encoder.encode(senderId),
    encoder.encode(conversationId),
    encoder.encode(timestamp.toString()),
    encoder.encode(messageType),
    payloadHash,
  ];
  
  // Concatenate all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  
  return sha256(combined);
}
