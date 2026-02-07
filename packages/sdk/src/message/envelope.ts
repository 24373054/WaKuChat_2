/**
 * EncryptedEnvelope module
 * Handles encryption and decryption of message envelopes
 */

import { encrypted_chat } from '../proto/index.js';
import { encrypt, decrypt, generateNonce } from '../crypto/index.js';

const ENVELOPE_VERSION = 1;

/**
 * Convert any buffer-like object to a proper Uint8Array
 * Creates a copy to ensure the data is in its own ArrayBuffer
 * This is necessary because protobuf may return views into larger buffers
 */
function toUint8Array(data: Uint8Array): Uint8Array {
  // Always create a copy to ensure we have a standalone buffer
  return new Uint8Array(data);
}

/**
 * Input for creating an encrypted envelope
 */
export interface EnvelopeInput {
  /** Serialized ChatMessage to encrypt */
  payload: Uint8Array;
  /** Session key for AES-256-GCM encryption */
  sessionKey: Uint8Array;
  /** Sender's user ID */
  senderId: string;
  /** Message timestamp */
  timestamp: number;
  /** ECDSA signature of the message */
  signature: Uint8Array;
}

/**
 * Decoded encrypted envelope
 */
export interface DecodedEnvelope {
  /** Decrypted payload (serialized ChatMessage) */
  payload: Uint8Array;
  /** Sender's user ID */
  senderId: string;
  /** Message timestamp */
  timestamp: number;
  /** ECDSA signature */
  signature: Uint8Array;
  /** Envelope version */
  version: number;
}

/**
 * Create an encrypted envelope from a message payload
 * @param input - Envelope input data
 * @returns Serialized EncryptedEnvelope
 */
export async function createEncryptedEnvelope(input: EnvelopeInput): Promise<Uint8Array> {
  // Generate a unique nonce for this message
  const nonce = generateNonce();
  
  // Encrypt the payload with AES-256-GCM
  const { ciphertext } = await encrypt(input.payload, input.sessionKey, nonce);

  // Create the envelope
  const envelope = encrypted_chat.EncryptedEnvelope.create({
    encryptedPayload: ciphertext,
    nonce: nonce,
    signature: input.signature,
    senderId: input.senderId,
    timestamp: input.timestamp,
    version: ENVELOPE_VERSION,
  });

  return encrypted_chat.EncryptedEnvelope.encode(envelope).finish();
}

/**
 * Open an encrypted envelope and decrypt its contents
 * @param data - Serialized EncryptedEnvelope
 * @param sessionKey - Session key for decryption
 * @returns Decoded envelope with decrypted payload
 */
export async function openEncryptedEnvelope(
  data: Uint8Array,
  sessionKey: Uint8Array
): Promise<DecodedEnvelope> {
  // Decode the envelope
  const envelope = encrypted_chat.EncryptedEnvelope.decode(data);

  // Convert protobuf buffers to proper Uint8Arrays
  const encryptedPayload = toUint8Array(envelope.encryptedPayload);
  const nonce = toUint8Array(envelope.nonce);
  const signature = toUint8Array(envelope.signature);

  // Decrypt the payload
  const payload = await decrypt(encryptedPayload, sessionKey, nonce);

  return {
    payload,
    senderId: envelope.senderId,
    timestamp: Number(envelope.timestamp),
    signature,
    version: envelope.version,
  };
}

/**
 * Extract envelope metadata without decrypting
 * Useful for filtering or routing before decryption
 */
export function extractEnvelopeMetadata(data: Uint8Array): {
  senderId: string;
  timestamp: number;
  version: number;
} {
  const envelope = encrypted_chat.EncryptedEnvelope.decode(data);
  return {
    senderId: envelope.senderId,
    timestamp: Number(envelope.timestamp),
    version: envelope.version,
  };
}
