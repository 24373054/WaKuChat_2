/**
 * Browser storage utilities
 */

import type { StoredConversationData } from '../types.js';

const IDENTITY_KEY = 'waku-chat-identity';
const CONVERSATIONS_KEY = 'waku-chat-conversations';

/**
 * Save encrypted identity to localStorage
 */
export function saveIdentity(encryptedData: string): void {
  localStorage.setItem(IDENTITY_KEY, encryptedData);
}

/**
 * Load encrypted identity from localStorage
 */
export function loadIdentity(): string | null {
  return localStorage.getItem(IDENTITY_KEY);
}

/**
 * Check if identity exists
 */
export function hasIdentity(): boolean {
  return localStorage.getItem(IDENTITY_KEY) !== null;
}

/**
 * Clear identity from localStorage
 */
export function clearIdentity(): void {
  localStorage.removeItem(IDENTITY_KEY);
}

/**
 * Save conversations to localStorage
 */
export function saveConversations(conversations: StoredConversationData[]): void {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

/**
 * Load conversations from localStorage
 */
export function loadConversations(): StoredConversationData[] {
  const data = localStorage.getItem(CONVERSATIONS_KEY);
  return data ? JSON.parse(data) : [];
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
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Truncate string for display
 */
export function truncate(str: string, maxLength: number = 20): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
