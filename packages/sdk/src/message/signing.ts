/**
 * Message signing and verification module
 * Implements ECDSA signing for message integrity and authenticity
 */

import { sha256 } from '@noble/hashes/sha256';
import { sign, verify, createSignatureData } from '../crypto/index.js';
import type { MessageType } from '../types.js';

/**
 * Data required for signing a message
 */
export interface SigningInput {
  messageId: string;
  senderId: string;
  conversationId: string;
  timestamp: number;
  messageType: MessageType;
  payload: Uint8Array;
}

/**
 * Sign a message using the sender's private key
 * @param input - Message data to sign
 * @param privateKey - Sender's private key
 * @returns 64-byte ECDSA signature
 */
export async function signMessage(
  input: SigningInput,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  const signatureData = createMessageSignatureData(input);
  return sign(signatureData, privateKey);
}

/**
 * Verify a message signature
 * @param input - Message data that was signed
 * @param signature - The signature to verify
 * @param publicKey - Sender's public key
 * @returns true if signature is valid
 */
export function verifyMessageSignature(
  input: SigningInput,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  const signatureData = createMessageSignatureData(input);
  return verify(signatureData, signature, publicKey);
}

/**
 * Create the data to be signed for a message
 * Combines message fields into a single byte array
 */
function createMessageSignatureData(input: SigningInput): Uint8Array {
  // Hash the payload first
  const payloadHash = sha256(input.payload);
  
  // Use the crypto module's createSignatureData function
  return createSignatureData(
    input.messageId,
    input.senderId,
    input.conversationId,
    input.timestamp,
    input.messageType,
    payloadHash
  );
}

/**
 * Public key resolver function type
 * Used to look up public keys by user ID
 */
export type PublicKeyResolver = (userId: string) => Promise<Uint8Array | null>;

/**
 * Verify a message with automatic public key lookup
 * @param input - Message data
 * @param signature - The signature to verify
 * @param senderId - Sender's user ID
 * @param resolver - Function to resolve public key from user ID
 * @returns true if signature is valid, false otherwise
 */
export async function verifyMessageWithResolver(
  input: SigningInput,
  signature: Uint8Array,
  senderId: string,
  resolver: PublicKeyResolver
): Promise<boolean> {
  const publicKey = await resolver(senderId);
  if (!publicKey) {
    return false;
  }
  return verifyMessageSignature(input, signature, publicKey);
}
