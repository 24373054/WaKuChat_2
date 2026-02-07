/**
 * Property-Based Tests for Revoke Permission Validation
 * 
 * **Validates: Requirements 4.3 (撤回权限验证)**
 * - CP5: 撤回权限 - 只有原发送者或群管理员的撤回请求才会被接受
 * 
 * Tests the following correctness properties:
 * - Original sender can always revoke their own messages
 * - In direct conversations, only sender can revoke
 * - In group conversations, sender OR admin can revoke
 * - Non-authorized users cannot revoke
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  validateRevokePermission,
  canRevokeMessage,
  type RevokePermissionInput,
} from './revoke-permission.js';

import { Identity } from '../identity/identity.js';
import { Conversation } from '../conversation/conversation.js';

/**
 * Generate a valid user ID (40 hex characters like real user IDs)
 */
const userIdArb = fc.hexaString({ minLength: 40, maxLength: 40 });

/**
 * Generate a list of unique user IDs
 */
const uniqueUserIdsArb = (count: number) =>
  fc.array(userIdArb, { minLength: count, maxLength: count })
    .filter(ids => new Set(ids).size === ids.length);

/**
 * **Validates: Requirements 4.3 (撤回权限验证)**
 * CP5: Revoke Permission Property
 * Only the original sender or group admins can revoke messages
 */
describe('CP5: Revoke Permission Validation', () => {
  /**
   * Property 1: Original sender can ALWAYS revoke their own message
   * This holds for both direct and group conversations
   */
  it('should always allow original sender to revoke their own message', () => {
    fc.assert(
      fc.property(
        userIdArb,
        fc.constantFrom('direct', 'group') as fc.Arbitrary<'direct' | 'group'>,
        fc.array(userIdArb, { minLength: 0, maxLength: 5 }),
        (senderId, conversationType, admins) => {
          const result = validateRevokePermission({
            revokerId: senderId,
            originalSenderId: senderId,
            conversationType,
            admins,
          });

          expect(result.allowed).toBe(true);
          expect(result.rule).toBe('sender');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: In direct conversations, ONLY the sender can revoke
   * No one else should be able to revoke, even if they're in some admin list
   */
  it('should only allow sender to revoke in direct conversations', () => {
    fc.assert(
      fc.property(
        uniqueUserIdsArb(2),
        (userIds) => {
          const [senderId, otherId] = userIds;

          // Sender can revoke
          const senderResult = validateRevokePermission({
            revokerId: senderId,
            originalSenderId: senderId,
            conversationType: 'direct',
            admins: [], // No admins in direct conversations
          });
          expect(senderResult.allowed).toBe(true);

          // Other user cannot revoke
          const otherResult = validateRevokePermission({
            revokerId: otherId,
            originalSenderId: senderId,
            conversationType: 'direct',
            admins: [],
          });
          expect(otherResult.allowed).toBe(false);
          expect(otherResult.rule).toBe('denied');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 3: In group conversations, admins can revoke ANY message
   */
  it('should allow group admins to revoke any message', () => {
    fc.assert(
      fc.property(
        uniqueUserIdsArb(3),
        (userIds) => {
          const [senderId, adminId, nonAdminId] = userIds;

          // Admin can revoke sender's message
          const adminResult = validateRevokePermission({
            revokerId: adminId,
            originalSenderId: senderId,
            conversationType: 'group',
            admins: [adminId],
          });
          expect(adminResult.allowed).toBe(true);
          expect(adminResult.rule).toBe('admin');

          // Non-admin cannot revoke sender's message
          const nonAdminResult = validateRevokePermission({
            revokerId: nonAdminId,
            originalSenderId: senderId,
            conversationType: 'group',
            admins: [adminId],
          });
          expect(nonAdminResult.allowed).toBe(false);
          expect(nonAdminResult.rule).toBe('denied');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: Multiple admins can all revoke messages
   */
  it('should allow any admin in the list to revoke', () => {
    fc.assert(
      fc.property(
        uniqueUserIdsArb(5),
        fc.integer({ min: 0, max: 2 }),
        (userIds, adminIndex) => {
          const [senderId, ...potentialAdmins] = userIds;
          const admins = potentialAdmins.slice(0, 3); // First 3 are admins
          const selectedAdmin = admins[adminIndex];

          const result = validateRevokePermission({
            revokerId: selectedAdmin,
            originalSenderId: senderId,
            conversationType: 'group',
            admins,
          });

          expect(result.allowed).toBe(true);
          expect(result.rule).toBe('admin');
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 5: Non-sender, non-admin users can NEVER revoke in groups
   */
  it('should deny revoke for non-sender non-admin users in groups', () => {
    fc.assert(
      fc.property(
        uniqueUserIdsArb(4),
        (userIds) => {
          const [senderId, adminId, regularMember1, regularMember2] = userIds;

          // Regular member cannot revoke
          const result = validateRevokePermission({
            revokerId: regularMember1,
            originalSenderId: senderId,
            conversationType: 'group',
            admins: [adminId],
          });

          expect(result.allowed).toBe(false);
          expect(result.rule).toBe('denied');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Integration tests with real Identity and Conversation objects
 */
describe('Revoke Permission with Real Objects', () => {
  /**
   * Test with actual Conversation.canRevoke method
   */
  it('should match Conversation.canRevoke behavior for direct conversations', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const alice = Identity.create();
          const bob = Identity.create();

          const conversation = Conversation.createDirect(
            {
              myUserId: alice.userId,
              peerUserId: bob.userId,
              peerPublicKey: bob.publicKey,
            },
            alice.privateKey
          );

          // Test all combinations
          const testCases = [
            { revoker: alice.userId, sender: alice.userId, expected: true },
            { revoker: bob.userId, sender: bob.userId, expected: true },
            { revoker: alice.userId, sender: bob.userId, expected: false },
            { revoker: bob.userId, sender: alice.userId, expected: false },
          ];

          for (const { revoker, sender, expected } of testCases) {
            const canRevokeResult = conversation.canRevoke(revoker, sender);
            const validateResult = canRevokeMessage(
              revoker,
              sender,
              conversation.type,
              conversation.admins
            );

            expect(canRevokeResult).toBe(expected);
            expect(validateResult).toBe(expected);
          }

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should match Conversation.canRevoke behavior for group conversations', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const admin = Identity.create();
          const member1 = Identity.create();
          const member2 = Identity.create();

          const group = Conversation.createGroup({
            name: 'Test Group',
            creatorUserId: admin.userId,
          });

          group.addMember(member1.userId);
          group.addMember(member2.userId);

          // Test cases for group
          const testCases = [
            // Admin can revoke anyone's message
            { revoker: admin.userId, sender: member1.userId, expected: true },
            { revoker: admin.userId, sender: member2.userId, expected: true },
            // Members can revoke their own messages
            { revoker: member1.userId, sender: member1.userId, expected: true },
            { revoker: member2.userId, sender: member2.userId, expected: true },
            // Members cannot revoke each other's messages
            { revoker: member1.userId, sender: member2.userId, expected: false },
            { revoker: member2.userId, sender: member1.userId, expected: false },
          ];

          for (const { revoker, sender, expected } of testCases) {
            const canRevokeResult = group.canRevoke(revoker, sender);
            const validateResult = canRevokeMessage(
              revoker,
              sender,
              group.type,
              group.admins
            );

            expect(canRevokeResult).toBe(expected);
            expect(validateResult).toBe(expected);
          }

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});

/**
 * Edge case tests
 */
describe('Revoke Permission Edge Cases', () => {
  it('should handle empty admin list in groups', () => {
    fc.assert(
      fc.property(
        uniqueUserIdsArb(2),
        (userIds) => {
          const [senderId, otherId] = userIds;

          // With no admins, only sender can revoke
          const senderResult = validateRevokePermission({
            revokerId: senderId,
            originalSenderId: senderId,
            conversationType: 'group',
            admins: [],
          });
          expect(senderResult.allowed).toBe(true);

          const otherResult = validateRevokePermission({
            revokerId: otherId,
            originalSenderId: senderId,
            conversationType: 'group',
            admins: [],
          });
          expect(otherResult.allowed).toBe(false);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle sender who is also admin', () => {
    fc.assert(
      fc.property(
        uniqueUserIdsArb(2),
        (userIds) => {
          const [senderAdminId, otherId] = userIds;

          // Sender who is also admin can revoke (via sender rule)
          const result = validateRevokePermission({
            revokerId: senderAdminId,
            originalSenderId: senderAdminId,
            conversationType: 'group',
            admins: [senderAdminId],
          });

          expect(result.allowed).toBe(true);
          // Should use sender rule first (more specific)
          expect(result.rule).toBe('sender');

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
