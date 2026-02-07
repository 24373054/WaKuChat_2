/**
 * ECIES (Elliptic Curve Integrated Encryption Scheme)
 * Used for encrypting data to a specific recipient using their public key
 * 
 * ECIES combines:
 * - ECDH for key agreement
 * - HKDF for key derivation
 * - AES-256-GCM for symmetric encryption
 */

import { generateKeyPair } from './keys';
import { computeSharedSecret, deriveKey } from './ecdh';
import { encrypt as aesEncrypt, decrypt as aesDecrypt } from './aes';

const ECIES_INFO = 'ecies-encryption-key';

export interface EciesEncryptedData {
  ephemeralPublicKey: Uint8Array; // 33 bytes (compressed)
  nonce: Uint8Array;              // 12 bytes
  ciphertext: Uint8Array;         // Variable length (includes auth tag)
}

/**
 * Encrypt data using ECIES
 * @param plaintext - Data to encrypt
 * @param recipientPublicKey - Recipient's public key
 * @returns Encrypted data with ephemeral public key and nonce
 */
export async function eciesEncrypt(
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array
): Promise<EciesEncryptedData> {
  // Generate ephemeral key pair
  const ephemeral = generateKeyPair();
  
  // Compute shared secret using ECDH
  const sharedSecret = computeSharedSecret(ephemeral.privateKey, recipientPublicKey);
  
  // Derive encryption key using HKDF
  const encryptionKey = deriveKey(sharedSecret, ephemeral.publicKey, ECIES_INFO);
  
  // Encrypt with AES-256-GCM
  const { ciphertext, nonce } = await aesEncrypt(plaintext, encryptionKey);
  
  return {
    ephemeralPublicKey: ephemeral.publicKey,
    nonce,
    ciphertext,
  };
}

/**
 * Decrypt ECIES encrypted data
 * @param encryptedData - ECIES encrypted data
 * @param recipientPrivateKey - Recipient's private key
 * @returns Decrypted plaintext
 */
export async function eciesDecrypt(
  encryptedData: EciesEncryptedData,
  recipientPrivateKey: Uint8Array
): Promise<Uint8Array> {
  const { ephemeralPublicKey, nonce, ciphertext } = encryptedData;
  
  // Compute shared secret using ECDH
  const sharedSecret = computeSharedSecret(recipientPrivateKey, ephemeralPublicKey);
  
  // Derive encryption key using HKDF
  const encryptionKey = deriveKey(sharedSecret, ephemeralPublicKey, ECIES_INFO);
  
  // Decrypt with AES-256-GCM
  return aesDecrypt(ciphertext, encryptionKey, nonce);
}

/**
 * Serialize ECIES encrypted data to bytes
 * Format: [ephemeralPublicKey (33)] [nonce (12)] [ciphertext (variable)]
 */
export function serializeEciesData(data: EciesEncryptedData): Uint8Array {
  const totalLength = data.ephemeralPublicKey.length + data.nonce.length + data.ciphertext.length;
  const result = new Uint8Array(totalLength);
  
  let offset = 0;
  result.set(data.ephemeralPublicKey, offset);
  offset += data.ephemeralPublicKey.length;
  
  result.set(data.nonce, offset);
  offset += data.nonce.length;
  
  result.set(data.ciphertext, offset);
  
  return result;
}

/**
 * Deserialize ECIES encrypted data from bytes
 */
export function deserializeEciesData(bytes: Uint8Array): EciesEncryptedData {
  const PUBKEY_LENGTH = 33;
  const NONCE_LENGTH = 12;
  
  if (bytes.length < PUBKEY_LENGTH + NONCE_LENGTH + 16) {
    throw new Error('Invalid ECIES data: too short');
  }
  
  let offset = 0;
  const ephemeralPublicKey = bytes.slice(offset, offset + PUBKEY_LENGTH);
  offset += PUBKEY_LENGTH;
  
  const nonce = bytes.slice(offset, offset + NONCE_LENGTH);
  offset += NONCE_LENGTH;
  
  const ciphertext = bytes.slice(offset);
  
  return { ephemeralPublicKey, nonce, ciphertext };
}

/**
 * Encrypt a string message using ECIES
 */
export async function eciesEncryptString(
  message: string,
  recipientPublicKey: Uint8Array
): Promise<EciesEncryptedData> {
  const encoder = new TextEncoder();
  return eciesEncrypt(encoder.encode(message), recipientPublicKey);
}

/**
 * Decrypt ECIES data to a string
 */
export async function eciesDecryptString(
  encryptedData: EciesEncryptedData,
  recipientPrivateKey: Uint8Array
): Promise<string> {
  const plaintext = await eciesDecrypt(encryptedData, recipientPrivateKey);
  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}
