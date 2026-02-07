/**
 * Crypto module exports
 * Provides all cryptographic primitives for the encrypted chat SDK
 */

// AES-256-GCM encryption
export {
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  generateNonce,
  generateAesKey,
} from './aes';

// secp256k1 key management
export {
  generateKeyPair,
  getPublicKey,
  isValidPrivateKey,
  isValidPublicKey,
  deriveUserId,
  exportPrivateKey,
  importPrivateKey,
  exportPublicKey,
  importPublicKey,
  compressPublicKey,
  decompressPublicKey,
  type KeyPair,
} from './keys';

// ECDSA signing
export {
  sign,
  signHash,
  verify,
  verifyHash,
  createSignatureData,
} from './ecdsa';

// ECDH key exchange
export {
  computeSharedSecret,
  deriveKey,
  deriveSessionKey,
  deriveConversationId,
  deriveMultipleKeys,
} from './ecdh';

// ECIES encryption
export {
  eciesEncrypt,
  eciesDecrypt,
  eciesEncryptString,
  eciesDecryptString,
  serializeEciesData,
  deserializeEciesData,
  type EciesEncryptedData,
} from './ecies';
