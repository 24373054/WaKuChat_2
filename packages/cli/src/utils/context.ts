/**
 * CLI Context - Manages shared state across commands
 */

import {
  ChatClient,
  Identity,
  IdentityStorage,
  createLevelDBBackend,
  type Conversation,
} from '@waku-chat/sdk';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const DATA_DIR = path.join(os.homedir(), '.waku-chat');
const IDENTITY_FILE = path.join(DATA_DIR, 'identity.json');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');

export interface StoredConversationData {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  members: string[];
  admins: string[];
  peerPublicKey?: string; // hex for direct conversations
  sessionKey: string; // hex
}

/**
 * Ensure data directory exists
 */
export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Get the data directory path
 */
export function getDataDir(): string {
  return DATA_DIR;
}

/**
 * Save identity to file
 */
export async function saveIdentityToFile(identity: Identity, password: string): Promise<void> {
  ensureDataDir();
  const exported = await identity.export(password);
  fs.writeFileSync(IDENTITY_FILE, exported, 'utf-8');
}

/**
 * Load identity from file
 */
export async function loadIdentityFromFile(password: string): Promise<Identity> {
  if (!fs.existsSync(IDENTITY_FILE)) {
    throw new Error('No identity found. Create one first with: waku-chat identity create');
  }
  const data = fs.readFileSync(IDENTITY_FILE, 'utf-8');
  return Identity.import(data, password);
}

/**
 * Check if identity exists
 */
export function identityExists(): boolean {
  return fs.existsSync(IDENTITY_FILE);
}


/**
 * Save conversations to file
 */
export function saveConversations(conversations: StoredConversationData[]): void {
  ensureDataDir();
  fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2), 'utf-8');
}

/**
 * Load conversations from file
 */
export function loadConversations(): StoredConversationData[] {
  if (!fs.existsSync(CONVERSATIONS_FILE)) {
    return [];
  }
  const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf-8');
  return JSON.parse(data);
}

/**
 * Add or update a conversation
 */
export function saveConversation(conv: StoredConversationData): void {
  const conversations = loadConversations();
  const index = conversations.findIndex(c => c.id === conv.id);
  if (index >= 0) {
    conversations[index] = conv;
  } else {
    conversations.push(conv);
  }
  saveConversations(conversations);
}

/**
 * Get a conversation by ID
 */
export function getConversation(id: string): StoredConversationData | undefined {
  const conversations = loadConversations();
  return conversations.find(c => c.id === id);
}

/**
 * Delete a conversation
 */
export function deleteConversation(id: string): void {
  const conversations = loadConversations();
  const filtered = conversations.filter(c => c.id !== id);
  saveConversations(filtered);
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Truncate string for display
 */
export function truncate(str: string, maxLength: number = 20): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
