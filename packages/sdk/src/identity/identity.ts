/**
 * Identity class for managing user identity in the encrypted chat SDK
 * Handles creation, export, import, and cryptographic operations
 */

import {
  generateKeyPair,
  getPublicKey,
  deriveUserId,
  exportPublicKey,
  importPublicKey,
  sign,
  verify,
  computeSharedSecret,
  encrypt,
  decrypt,
  type KeyPair,
} from '../crypto/index.js';
import { sha256 } from '@noble/hashes/sha256';

export interface IdentityData {
  userId: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface ExportedIdentity {
  version: number;
  userId: string;
  publicKey: string; // hex
  encryptedPrivateKey: string; // hex (encrypted with password)
  nonce: string; // hex
}

/**
 * Identity class representing a user's cryptographic identity
 */
export class Identity implements IdentityData {
  public readonly userId: string;
  public readonly publicKey: Uint8Array;
  public readonly privateKey: Uint8Array;

  private constructor(keyPair: KeyPair) {
    this.privateKey = keyPair.privateKey;
    this.publicKey = keyPair.publicKey;
    this.userId = deriveUserId(this.publicKey);
  }

  /**
   * Create a new identity with a fresh key pair
   */
  static create(): Identity {
    const keyPair = generateKeyPair();
    return new Identity(keyPair);
  }


  /**
   * Create an identity from an existing key pair
   */
  static fromKeyPair(keyPair: KeyPair): Identity {
    return new Identity(keyPair);
  }

  /**
   * Import an identity from a private key
   */
  static fromPrivateKey(privateKey: Uint8Array): Identity {
    const derivedPublicKey = getPublicKey(privateKey, true);
    return new Identity({ privateKey, publicKey: derivedPublicKey });
  }

  /**
   * Export identity to encrypted JSON format
   * @param password - Password to encrypt the private key
   */
  async export(password: string): Promise<string> {
    const passwordKey = await this.derivePasswordKey(password);
    const { ciphertext, nonce } = await encrypt(this.privateKey, passwordKey);

    const exported: ExportedIdentity = {
      version: 1,
      userId: this.userId,
      publicKey: exportPublicKey(this.publicKey),
      encryptedPrivateKey: this.bytesToHex(ciphertext),
      nonce: this.bytesToHex(nonce),
    };

    return JSON.stringify(exported);
  }

  /**
   * Import identity from encrypted JSON format
   * @param data - JSON string from export()
   * @param password - Password to decrypt the private key
   */
  static async import(data: string, password: string): Promise<Identity> {
    const exported: ExportedIdentity = JSON.parse(data);

    if (exported.version !== 1) {
      throw new Error(`Unsupported identity version: ${exported.version}`);
    }

    const passwordKey = await Identity.derivePasswordKeyStatic(password);
    const encryptedPrivateKey = Identity.hexToBytes(exported.encryptedPrivateKey);
    const nonce = Identity.hexToBytes(exported.nonce);

    const privateKey = await decrypt(encryptedPrivateKey, passwordKey, nonce);
    const publicKey = importPublicKey(exported.publicKey);

    // Verify the public key matches the private key
    const derivedPublicKey = getPublicKey(privateKey, true);
    
    if (!Identity.arraysEqual(derivedPublicKey, publicKey)) {
      throw new Error('Public key does not match private key');
    }

    // Verify userId matches
    const derivedUserId = deriveUserId(publicKey);
    if (derivedUserId !== exported.userId) {
      throw new Error('User ID does not match public key');
    }

    return new Identity({ privateKey, publicKey });
  }


  /**
   * Sign data using this identity's private key
   */
  async sign(data: Uint8Array): Promise<Uint8Array> {
    return sign(data, this.privateKey);
  }

  /**
   * Verify a signature using a public key
   */
  verify(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    return verify(data, signature, publicKey);
  }

  /**
   * Derive a shared secret with another user's public key using ECDH
   */
  deriveSharedSecret(peerPublicKey: Uint8Array): Uint8Array {
    return computeSharedSecret(this.privateKey, peerPublicKey);
  }

  /**
   * Get identity data as a plain object
   */
  toData(): IdentityData {
    return {
      userId: this.userId,
      publicKey: this.publicKey,
      privateKey: this.privateKey,
    };
  }

  // Helper methods
  private async derivePasswordKey(password: string): Promise<Uint8Array> {
    return Identity.derivePasswordKeyStatic(password);
  }

  private static async derivePasswordKeyStatic(password: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
    
    // Use SHA-256 to derive a 32-byte key from password
    // In production, consider using PBKDF2 or Argon2 for better security
    return sha256(passwordBytes);
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  private static arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}
