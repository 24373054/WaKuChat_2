/**
 * secp256k1 key pair generation and management
 * Uses @noble/secp256k1 for cryptographic operations
 */

import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * Generate a new secp256k1 key pair
 */
export function generateKeyPair(): KeyPair {
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed
  
  return { privateKey, publicKey };
}

/**
 * Derive public key from private key
 * @param privateKey - 32-byte private key
 * @param compressed - Whether to return compressed public key (default: true)
 */
export function getPublicKey(privateKey: Uint8Array, compressed = true): Uint8Array {
  return secp256k1.getPublicKey(privateKey, compressed);
}

/**
 * Validate a private key
 */
export function isValidPrivateKey(privateKey: Uint8Array): boolean {
  try {
    secp256k1.getPublicKey(privateKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a public key
 */
export function isValidPublicKey(publicKey: Uint8Array): boolean {
  try {
    secp256k1.ProjectivePoint.fromHex(publicKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Derive a user ID from a public key
 * Uses SHA256 hash of the public key, truncated to first 20 bytes (hex encoded)
 */
export function deriveUserId(publicKey: Uint8Array): string {
  const hash = sha256(publicKey);
  return bytesToHex(hash.slice(0, 20)); // 40 hex characters
}

/**
 * Export private key to hex string
 */
export function exportPrivateKey(privateKey: Uint8Array): string {
  return bytesToHex(privateKey);
}

/**
 * Import private key from hex string
 */
export function importPrivateKey(hexKey: string): Uint8Array {
  const privateKey = hexToBytes(hexKey);
  if (!isValidPrivateKey(privateKey)) {
    throw new Error('Invalid private key');
  }
  return privateKey;
}

/**
 * Export public key to hex string
 */
export function exportPublicKey(publicKey: Uint8Array): string {
  return bytesToHex(publicKey);
}

/**
 * Import public key from hex string
 */
export function importPublicKey(hexKey: string): Uint8Array {
  const publicKey = hexToBytes(hexKey);
  if (!isValidPublicKey(publicKey)) {
    throw new Error('Invalid public key');
  }
  return publicKey;
}

/**
 * Compress a public key (65 bytes -> 33 bytes)
 */
export function compressPublicKey(publicKey: Uint8Array): Uint8Array {
  const point = secp256k1.ProjectivePoint.fromHex(publicKey);
  return point.toRawBytes(true);
}

/**
 * Decompress a public key (33 bytes -> 65 bytes)
 */
export function decompressPublicKey(publicKey: Uint8Array): Uint8Array {
  const point = secp256k1.ProjectivePoint.fromHex(publicKey);
  return point.toRawBytes(false);
}
