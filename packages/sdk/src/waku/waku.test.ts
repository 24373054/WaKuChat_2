// Tests for Waku adapter utilities
import { describe, it, expect } from 'vitest';
import {
  generateContentTopic,
  generateDMConversationId,
  generateDMContentTopic,
  generateGroupContentTopic,
  generateSystemContentTopic,
  parseContentTopic,
  isValidContentTopic,
  DEFAULT_PUBSUB_TOPIC,
  CONTENT_TOPIC_VERSION,
} from './topics.js';

describe('Content Topic Utilities', () => {
  describe('generateContentTopic', () => {
    it('should generate correct content topic format', () => {
      const topic = generateContentTopic('dm', 'abc123');
      expect(topic).toBe('/waku-chat/1/dm-abc123/proto');
    });

    it('should generate group content topic', () => {
      const topic = generateContentTopic('group', 'group-id');
      expect(topic).toBe('/waku-chat/1/group-group-id/proto');
    });

    it('should generate system content topic', () => {
      const topic = generateContentTopic('system', 'user-id');
      expect(topic).toBe('/waku-chat/1/system-user-id/proto');
    });
  });

  describe('generateDMConversationId', () => {
    it('should generate deterministic conversation ID', () => {
      const id1 = generateDMConversationId('alice', 'bob');
      const id2 = generateDMConversationId('bob', 'alice');
      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different user pairs', () => {
      const id1 = generateDMConversationId('alice', 'bob');
      const id2 = generateDMConversationId('alice', 'charlie');
      expect(id1).not.toBe(id2);
    });

    it('should return 32 character hex string', () => {
      const id = generateDMConversationId('user1', 'user2');
      expect(id).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('generateDMContentTopic', () => {
    it('should generate DM content topic', () => {
      const topic = generateDMContentTopic('alice', 'bob');
      expect(topic).toMatch(/^\/waku-chat\/1\/dm-[a-f0-9]{32}\/proto$/);
    });

    it('should be deterministic regardless of user order', () => {
      const topic1 = generateDMContentTopic('alice', 'bob');
      const topic2 = generateDMContentTopic('bob', 'alice');
      expect(topic1).toBe(topic2);
    });
  });

  describe('generateGroupContentTopic', () => {
    it('should generate group content topic', () => {
      const topic = generateGroupContentTopic('my-group-id');
      expect(topic).toBe('/waku-chat/1/group-my-group-id/proto');
    });
  });

  describe('generateSystemContentTopic', () => {
    it('should generate system content topic', () => {
      const topic = generateSystemContentTopic('target-user');
      expect(topic).toBe('/waku-chat/1/system-target-user/proto');
    });
  });

  describe('parseContentTopic', () => {
    it('should parse valid DM content topic', () => {
      const result = parseContentTopic('/waku-chat/1/dm-abc123/proto');
      expect(result).toEqual({
        version: '1',
        type: 'dm',
        id: 'abc123',
      });
    });

    it('should parse valid group content topic', () => {
      const result = parseContentTopic('/waku-chat/1/group-group-id/proto');
      expect(result).toEqual({
        version: '1',
        type: 'group',
        id: 'group-id',
      });
    });

    it('should parse valid system content topic', () => {
      const result = parseContentTopic('/waku-chat/1/system-user-id/proto');
      expect(result).toEqual({
        version: '1',
        type: 'system',
        id: 'user-id',
      });
    });

    it('should return null for invalid topic', () => {
      expect(parseContentTopic('/invalid/topic')).toBeNull();
      expect(parseContentTopic('')).toBeNull();
      expect(parseContentTopic('/waku-chat/1/invalid-id/proto')).toBeNull();
    });
  });

  describe('isValidContentTopic', () => {
    it('should return true for valid topics', () => {
      expect(isValidContentTopic('/waku-chat/1/dm-abc/proto')).toBe(true);
      expect(isValidContentTopic('/waku-chat/1/group-xyz/proto')).toBe(true);
      expect(isValidContentTopic('/waku-chat/1/system-user/proto')).toBe(true);
    });

    it('should return false for invalid topics', () => {
      expect(isValidContentTopic('/invalid')).toBe(false);
      expect(isValidContentTopic('')).toBe(false);
      expect(isValidContentTopic('/waku-chat/1/unknown-id/proto')).toBe(false);
    });
  });

  describe('Constants', () => {
    it('should have correct default pubsub topic', () => {
      expect(DEFAULT_PUBSUB_TOPIC).toBe('/waku/2/default-waku/proto');
    });

    it('should have correct content topic version', () => {
      expect(CONTENT_TOPIC_VERSION).toBe('1');
    });
  });
});
