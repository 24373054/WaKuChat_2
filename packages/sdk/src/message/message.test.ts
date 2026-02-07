/**
 * Tests for the message processing module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateMessageId,
  generateMessageIdWithRandom,
  isValidMessageId,
} from './message-id.js';
import {
  serializeChatMessage,
  deserializeChatMessage,
  serializeTextPayload,
  deserializeTextPayload,
  serializeRevokePayload,
  deserializeRevokePayload,
} from './serialization.js';
import {
  createEncryptedEnvelope,
  openEncryptedEnvelope,
  extractEnvelopeMetadata,
} from './envelope.js';
import {
  signMessage,
  verifyMessageSignature,
} from './signing.js';
import { DedupeCache } from './dedupe-cache.js';
import { MessageSender, SendError } from './sender.js';
import { generateKeyPair, generateAesKey } from '../crypto/index.js';

describe('Message ID Generation', () => {
  it('should generate valid message IDs', () => {
    const timestamp = Date.now();
    const senderId = 'user123';
    
    const messageId = generateMessageId(timestamp, senderId);
    
    expect(isValidMessageId(messageId)).toBe(true);
    expect(messageId.length).toBe(64); // SHA256 = 32 bytes = 64 hex chars
  });

  it('should generate different IDs for same input (due to random)', () => {
    const timestamp = Date.now();
    const senderId = 'user123';
    
    const id1 = generateMessageId(timestamp, senderId);
    const id2 = generateMessageId(timestamp, senderId);
    
    expect(id1).not.toBe(id2);
  });

  it('should generate deterministic IDs with same random bytes', () => {
    const timestamp = 1234567890;
    const senderId = 'user123';
    const randomBytes = new Uint8Array(16).fill(42);
    
    const id1 = generateMessageIdWithRandom(timestamp, senderId, randomBytes);
    const id2 = generateMessageIdWithRandom(timestamp, senderId, randomBytes);
    
    expect(id1).toBe(id2);
  });

  it('should reject invalid message IDs', () => {
    expect(isValidMessageId('')).toBe(false);
    expect(isValidMessageId('abc')).toBe(false);
    expect(isValidMessageId('xyz'.repeat(22))).toBe(false); // wrong chars
    expect(isValidMessageId('a'.repeat(63))).toBe(false); // too short
    expect(isValidMessageId('a'.repeat(65))).toBe(false); // too long
  });
});

describe('Message Serialization', () => {
  it('should serialize and deserialize ChatMessage', () => {
    const input = {
      messageId: 'a'.repeat(64),
      senderId: 'user123',
      conversationId: 'conv456',
      convType: 'direct' as const,
      type: 'TEXT' as const,
      timestamp: Date.now(),
      payload: new TextEncoder().encode('Hello'),
    };

    const serialized = serializeChatMessage(input);
    const deserialized = deserializeChatMessage(serialized);

    expect(deserialized.messageId).toBe(input.messageId);
    expect(deserialized.senderId).toBe(input.senderId);
    expect(deserialized.conversationId).toBe(input.conversationId);
    expect(deserialized.convType).toBe(input.convType);
    expect(deserialized.type).toBe(input.type);
    expect(deserialized.timestamp).toBe(input.timestamp);
    expect(deserialized.version).toBe(1);
  });

  it('should serialize and deserialize TextPayload', () => {
    const content = 'Hello, World!';
    
    const serialized = serializeTextPayload(content);
    const deserialized = deserializeTextPayload(serialized);
    
    expect(deserialized).toBe(content);
  });

  it('should serialize and deserialize RevokePayload', () => {
    const targetMessageId = 'b'.repeat(64);
    const reason = 'User requested';
    
    const serialized = serializeRevokePayload(targetMessageId, reason);
    const deserialized = deserializeRevokePayload(serialized);
    
    expect(deserialized.targetMessageId).toBe(targetMessageId);
    expect(deserialized.reason).toBe(reason);
  });
});

describe('Encrypted Envelope', () => {
  it('should create and open encrypted envelope', async () => {
    const sessionKey = generateAesKey();
    const payload = new TextEncoder().encode('Secret message');
    const signature = new Uint8Array(64).fill(1);
    
    const input = {
      payload,
      sessionKey,
      senderId: 'user123',
      timestamp: Date.now(),
      signature,
    };

    const envelope = await createEncryptedEnvelope(input);
    const opened = await openEncryptedEnvelope(envelope, sessionKey);

    expect(opened.senderId).toBe(input.senderId);
    expect(opened.timestamp).toBe(input.timestamp);
    expect(new Uint8Array(opened.payload)).toEqual(payload);
    expect(new Uint8Array(opened.signature)).toEqual(signature);
  });

  it('should extract metadata without decryption', async () => {
    const sessionKey = generateAesKey();
    const input = {
      payload: new Uint8Array([1, 2, 3]),
      sessionKey,
      senderId: 'user456',
      timestamp: 1234567890,
      signature: new Uint8Array(64),
    };

    const envelope = await createEncryptedEnvelope(input);
    const metadata = extractEnvelopeMetadata(envelope);

    expect(metadata.senderId).toBe(input.senderId);
    expect(metadata.timestamp).toBe(input.timestamp);
    expect(metadata.version).toBe(1);
  });
});

describe('Message Signing', () => {
  it('should sign and verify messages', async () => {
    const keyPair = generateKeyPair();
    const input = {
      messageId: 'c'.repeat(64),
      senderId: 'user123',
      conversationId: 'conv456',
      timestamp: Date.now(),
      messageType: 'TEXT' as const,
      payload: new TextEncoder().encode('Hello'),
    };

    const signature = await signMessage(input, keyPair.privateKey);
    const isValid = verifyMessageSignature(input, signature, keyPair.publicKey);

    expect(isValid).toBe(true);
  });

  it('should reject tampered messages', async () => {
    const keyPair = generateKeyPair();
    const input = {
      messageId: 'd'.repeat(64),
      senderId: 'user123',
      conversationId: 'conv456',
      timestamp: Date.now(),
      messageType: 'TEXT' as const,
      payload: new TextEncoder().encode('Hello'),
    };

    const signature = await signMessage(input, keyPair.privateKey);
    
    // Tamper with the message
    const tamperedInput = { ...input, payload: new TextEncoder().encode('Tampered') };
    const isValid = verifyMessageSignature(tamperedInput, signature, keyPair.publicKey);

    expect(isValid).toBe(false);
  });
});

describe('DedupeCache', () => {
  let cache: DedupeCache;

  beforeEach(() => {
    cache = new DedupeCache({ maxSize: 100, ttl: 1000 });
  });

  it('should detect duplicates', () => {
    const messageId = 'msg1';
    
    expect(cache.isDuplicate(messageId)).toBe(false);
    cache.add(messageId);
    expect(cache.isDuplicate(messageId)).toBe(true);
  });

  it('should handle checkAndAdd', () => {
    const messageId = 'msg2';
    
    expect(cache.checkAndAdd(messageId)).toBe(false); // Not duplicate, added
    expect(cache.checkAndAdd(messageId)).toBe(true);  // Duplicate
  });

  it('should expire entries after TTL', async () => {
    const shortTtlCache = new DedupeCache({ ttl: 50 });
    const messageId = 'msg3';
    
    shortTtlCache.add(messageId);
    expect(shortTtlCache.isDuplicate(messageId)).toBe(true);
    
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(shortTtlCache.isDuplicate(messageId)).toBe(false);
  });

  it('should evict entries when at capacity', () => {
    const smallCache = new DedupeCache({ maxSize: 5 });
    
    for (let i = 0; i < 10; i++) {
      smallCache.add(`msg${i}`);
    }
    
    expect(smallCache.size).toBeLessThanOrEqual(5);
  });

  it('should clear all entries', () => {
    cache.add('msg1');
    cache.add('msg2');
    expect(cache.size).toBe(2);
    
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('MessageSender', () => {
  it('should send successfully on first attempt', async () => {
    const sender = new MessageSender({ maxRetries: 3 });
    let callCount = 0;
    
    const mockAdapter = {
      publish: async () => { callCount++; },
    } as any;

    await sender.send(mockAdapter, '/test/topic', new Uint8Array([1, 2, 3]));
    
    expect(callCount).toBe(1);
  });

  it('should retry on failure', async () => {
    const sender = new MessageSender({ maxRetries: 3, baseDelay: 10 });
    let callCount = 0;
    
    const mockAdapter = {
      publish: async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Network error');
        }
      },
    } as any;

    await sender.send(mockAdapter, '/test/topic', new Uint8Array([1, 2, 3]));
    
    expect(callCount).toBe(3);
  });

  it('should throw SendError after max retries', async () => {
    const sender = new MessageSender({ maxRetries: 2, baseDelay: 10 });
    
    const mockAdapter = {
      publish: async () => {
        throw new Error('Always fails');
      },
    } as any;

    await expect(
      sender.send(mockAdapter, '/test/topic', new Uint8Array([1, 2, 3]))
    ).rejects.toThrow(SendError);
  });

  it('should calculate exponential backoff delay', () => {
    const sender = new MessageSender({ baseDelay: 1000, maxDelay: 30000 });
    
    // First attempt: ~1000ms
    const delay0 = sender.calculateDelay(0);
    expect(delay0).toBeGreaterThanOrEqual(900);
    expect(delay0).toBeLessThanOrEqual(1100);
    
    // Second attempt: ~2000ms
    const delay1 = sender.calculateDelay(1);
    expect(delay1).toBeGreaterThanOrEqual(1800);
    expect(delay1).toBeLessThanOrEqual(2200);
    
    // Third attempt: ~4000ms
    const delay2 = sender.calculateDelay(2);
    expect(delay2).toBeGreaterThanOrEqual(3600);
    expect(delay2).toBeLessThanOrEqual(4400);
  });
});
