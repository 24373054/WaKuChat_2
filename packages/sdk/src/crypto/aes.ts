/**
 * AES-256-GCM encryption/decryption module
 * Uses Web Crypto API for cross-platform compatibility
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const NONCE_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 128; // 128 bits authentication tag

/**
 * Generate a random nonce for AES-GCM
 */
export function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(NONCE_LENGTH);
  crypto.getRandomValues(nonce);
  return nonce;
}

/**
 * Generate a random AES-256 key
 */
export function generateAesKey(): Uint8Array {
  const key = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(key);
  return key;
}

/**
 * Import a raw key for use with Web Crypto API
 */
async function importKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.length !== 32) {
    throw new Error('AES-256 key must be 32 bytes');
  }
  // Create a copy to ensure we have a proper ArrayBuffer
  const keyBuffer = toArrayBuffer(rawKey);
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Convert Uint8Array to ArrayBuffer, handling views correctly
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  // Use slice to create a new ArrayBuffer with just the data we need
  // This handles cases where the Uint8Array is a view into a larger buffer
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer as ArrayBuffer;
  }
  return data.slice().buffer as ArrayBuffer;
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param plaintext - Data to encrypt
 * @param key - 32-byte AES key
 * @param nonce - Optional 12-byte nonce (generated if not provided)
 * @returns Object containing encrypted data and nonce
 */
export async function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce?: Uint8Array
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const iv = nonce ?? generateNonce();
  
  if (iv.length !== NONCE_LENGTH) {
    throw new Error(`Nonce must be ${NONCE_LENGTH} bytes`);
  }

  const cryptoKey = await importKey(key);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: toArrayBuffer(iv), tagLength: TAG_LENGTH },
    cryptoKey,
    toArrayBuffer(plaintext)
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce: iv,
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param ciphertext - Encrypted data (includes auth tag)
 * @param key - 32-byte AES key
 * @param nonce - 12-byte nonce used during encryption
 * @returns Decrypted plaintext
 */
export async function decrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  if (nonce.length !== NONCE_LENGTH) {
    throw new Error(`Nonce must be ${NONCE_LENGTH} bytes`);
  }

  const cryptoKey = await importKey(key);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: toArrayBuffer(nonce), tagLength: TAG_LENGTH },
    cryptoKey,
    toArrayBuffer(ciphertext)
  );

  return new Uint8Array(plaintext);
}

/**
 * Encrypt a string message
 */
export async function encryptString(
  message: string,
  key: Uint8Array,
  nonce?: Uint8Array
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(message);
  return encrypt(plaintext, key, nonce);
}

/**
 * Decrypt to a string message
 */
export async function decryptString(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Promise<string> {
  const plaintext = await decrypt(ciphertext, key, nonce);
  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}
