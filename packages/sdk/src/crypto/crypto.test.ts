/**
 * Property-Based Tests for Crypto Module
 * 
 * Tests the following correctness properties from design.md:
 * - CP1: 加密一致性 - decrypt(encrypt(M, K), K) = M
 * - CP2: 签名不可伪造 - Only private key holder can create valid signatures
 * - CP3: ECDH 对称性 - ECDH(a, B) = ECDH(b, A)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  encrypt,
  decrypt,
  generateAesKey,
} from './aes';

import {
  generateKeyPair,
  isValidPrivateKey,
  isValidPublicKey,
  deriveUserId,
} from './keys';

import {
  sign,
  verify,
} from './ecdsa';

import {
  computeSharedSecret,
  deriveSessionKey,
  deriveConversationId,
} from './ecdh';

import {
  eciesEncrypt,
  eciesDecrypt,
} from './ecies';

/**
 * **Validates: Requirements 5.1 (消息加密)**
 * CP1: Encryption Consistency Property
 * For any plaintext M and key K: decrypt(encrypt(M, K), K) = M
 */
describe('CP1: AES-256-GCM Encryption Consistency', () => {
  it('should decrypt to original plaintext for any input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 10000 }),
        async (plaintext) => {
          const key = generateAesKey();
          const { ciphertext, nonce } = await encrypt(plaintext, key);
          const decrypted = await decrypt(ciphertext, key, nonce);
          
          expect(decrypted.length).toBe(plaintext.length);
          for (let i = 0; i < plaintext.length; i++) {
            expect(decrypted[i]).toBe(plaintext[i]);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce different ciphertext for same plaintext with different nonces', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 1000 }),
        async (plaintext) => {
          const key = generateAesKey();
          const result1 = await encrypt(plaintext, key);
          const result2 = await encrypt(plaintext, key);
          
          // Nonces should be different
          let noncesDifferent = false;
          for (let i = 0; i < result1.nonce.length; i++) {
            if (result1.nonce[i] !== result2.nonce[i]) {
              noncesDifferent = true;
              break;
            }
          }
          expect(noncesDifferent).toBe(true);
          
          // Both should decrypt correctly
          const decrypted1 = await decrypt(result1.ciphertext, key, result1.nonce);
          const decrypted2 = await decrypt(result2.ciphertext, key, result2.nonce);
          
          expect(decrypted1).toEqual(plaintext);
          expect(decrypted2).toEqual(plaintext);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * **Validates: Requirements 5.2 (消息完整性)**
 * CP2: Signature Verification Property
 * Only the private key holder can create valid signatures
 */
describe('CP2: ECDSA Signature Verification', () => {
  it('should verify signatures created with matching private key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 10000 }),
        async (data) => {
          const keyPair = generateKeyPair();
          const signature = await sign(data, keyPair.privateKey);
          const isValid = verify(data, signature, keyPair.publicKey);
          
          expect(isValid).toBe(true);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject signatures from different private keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 1000 }),
        async (data) => {
          const alice = generateKeyPair();
          const bob = generateKeyPair();
          
          // Alice signs the data
          const signature = await sign(data, alice.privateKey);
          
          // Verify with Alice's public key should succeed
          expect(verify(data, signature, alice.publicKey)).toBe(true);
          
          // Verify with Bob's public key should fail
          expect(verify(data, signature, bob.publicKey)).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject signatures for modified data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 2, maxLength: 1000 }),
        async (data) => {
          const keyPair = generateKeyPair();
          const signature = await sign(data, keyPair.privateKey);
          
          // Modify the data
          const modifiedData = new Uint8Array(data);
          modifiedData[0] = (modifiedData[0] + 1) % 256;
          
          // Original should verify
          expect(verify(data, signature, keyPair.publicKey)).toBe(true);
          
          // Modified should not verify
          expect(verify(modifiedData, signature, keyPair.publicKey)).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * **Validates: Requirements 5.3 (密钥交换)**
 * CP3: ECDH Symmetry Property
 * For any two key pairs (a, A) and (b, B): ECDH(a, B) = ECDH(b, A)
 */
describe('CP3: ECDH Symmetry', () => {
  it('should derive identical shared secrets from both sides', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const alice = generateKeyPair();
          const bob = generateKeyPair();
          
          const aliceShared = computeSharedSecret(alice.privateKey, bob.publicKey);
          const bobShared = computeSharedSecret(bob.privateKey, alice.publicKey);
          
          expect(aliceShared.length).toBe(bobShared.length);
          for (let i = 0; i < aliceShared.length; i++) {
            expect(aliceShared[i]).toBe(bobShared[i]);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should derive identical session keys for direct messaging', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (conversationId) => {
          const alice = generateKeyPair();
          const bob = generateKeyPair();
          
          const aliceSessionKey = deriveSessionKey(alice.privateKey, bob.publicKey, conversationId);
          const bobSessionKey = deriveSessionKey(bob.privateKey, alice.publicKey, conversationId);
          
          expect(aliceSessionKey.length).toBe(32); // AES-256 key
          expect(bobSessionKey.length).toBe(32);
          
          for (let i = 0; i < aliceSessionKey.length; i++) {
            expect(aliceSessionKey[i]).toBe(bobSessionKey[i]);
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should derive different shared secrets with different peers', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const alice = generateKeyPair();
          const bob = generateKeyPair();
          const charlie = generateKeyPair();
          
          const aliceBobShared = computeSharedSecret(alice.privateKey, bob.publicKey);
          const aliceCharlieShared = computeSharedSecret(alice.privateKey, charlie.publicKey);
          
          // Shared secrets should be different
          let different = false;
          for (let i = 0; i < aliceBobShared.length; i++) {
            if (aliceBobShared[i] !== aliceCharlieShared[i]) {
              different = true;
              break;
            }
          }
          expect(different).toBe(true);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Additional Property Tests for ECIES
 * **Validates: Requirements 5.3 (密钥交换) - 密钥交换消息本身使用接收者公钥加密**
 */
describe('ECIES Encryption Properties', () => {
  it('should decrypt to original plaintext', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 1000 }),
        async (plaintext) => {
          const recipient = generateKeyPair();
          
          const encrypted = await eciesEncrypt(plaintext, recipient.publicKey);
          const decrypted = await eciesDecrypt(encrypted, recipient.privateKey);
          
          expect(decrypted.length).toBe(plaintext.length);
          for (let i = 0; i < plaintext.length; i++) {
            expect(decrypted[i]).toBe(plaintext[i]);
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should fail decryption with wrong private key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 100 }),
        async (plaintext) => {
          const alice = generateKeyPair();
          const bob = generateKeyPair();
          
          // Encrypt to Alice
          const encrypted = await eciesEncrypt(plaintext, alice.publicKey);
          
          // Alice can decrypt
          const decrypted = await eciesDecrypt(encrypted, alice.privateKey);
          expect(decrypted).toEqual(plaintext);
          
          // Bob cannot decrypt (should throw)
          try {
            await eciesDecrypt(encrypted, bob.privateKey);
            // If we get here, decryption succeeded but data should be garbage
            // AES-GCM should throw on auth tag mismatch
            return false;
          } catch {
            // Expected - decryption should fail
            return true;
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

/**
 * Key Generation Properties
 * **Validates: Requirements 1.1 (用户身份创建与持久化)**
 */
describe('Key Generation Properties', () => {
  it('should generate valid key pairs', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const keyPair = generateKeyPair();
          
          expect(isValidPrivateKey(keyPair.privateKey)).toBe(true);
          expect(isValidPublicKey(keyPair.publicKey)).toBe(true);
          expect(keyPair.privateKey.length).toBe(32);
          expect(keyPair.publicKey.length).toBe(33); // compressed
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should derive unique user IDs from different keys', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const keyPair1 = generateKeyPair();
          const keyPair2 = generateKeyPair();
          
          const userId1 = deriveUserId(keyPair1.publicKey);
          const userId2 = deriveUserId(keyPair2.publicKey);
          
          expect(userId1).not.toBe(userId2);
          expect(userId1.length).toBe(40); // 20 bytes as hex
          expect(userId2.length).toBe(40);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should derive consistent user ID from same public key', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const keyPair = generateKeyPair();
          
          const userId1 = deriveUserId(keyPair.publicKey);
          const userId2 = deriveUserId(keyPair.publicKey);
          
          expect(userId1).toBe(userId2);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Conversation ID Derivation Properties
 * **Validates: Requirements 1.2 (单聊会话创建) - 单聊会话 ID 由双方 userId 确定性生成**
 */
describe('Conversation ID Properties', () => {
  it('should derive same conversation ID regardless of order', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (userId1, userId2) => {
          const convId1 = deriveConversationId(userId1, userId2);
          const convId2 = deriveConversationId(userId2, userId1);
          
          expect(convId1).toBe(convId2);
          expect(convId1.length).toBe(32); // 16 bytes as hex
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should derive different conversation IDs for different user pairs', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const alice = generateKeyPair();
          const bob = generateKeyPair();
          const charlie = generateKeyPair();
          
          const aliceId = deriveUserId(alice.publicKey);
          const bobId = deriveUserId(bob.publicKey);
          const charlieId = deriveUserId(charlie.publicKey);
          
          const aliceBobConv = deriveConversationId(aliceId, bobId);
          const aliceCharlieConv = deriveConversationId(aliceId, charlieId);
          
          expect(aliceBobConv).not.toBe(aliceCharlieConv);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
