/**
 * Conversations View - 会话列表
 * 简约现代风格
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import { loadConversations, saveConversation, deleteConversation, bytesToHex, hexToBytes, truncate } from '../utils/storage.js';
import type { StoredConversationData } from '../types.js';
import ChatView from './ChatView.js';
import './ConversationsView.css';

type DialogMode = null | 'create-dm' | 'create-group' | 'join-group';

export default function ConversationsView() {
  const { identity, client, currentConversationId, setCurrentConversation, setError, addConversation } = useApp();
  const [conversations, setConversations] = useState<StoredConversationData[]>([]);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [peerUserId, setPeerUserId] = useState('');
  const [peerPublicKey, setPeerPublicKey] = useState('');
  const [groupName, setGroupName] = useState('');
  const [inviteData, setInviteData] = useState('');

  useEffect(() => {
    const stored = loadConversations();
    setConversations(stored);
  }, []);

  const handleCreateDM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !identity) {
      setError('Please wait for connection');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const peerPubKeyBytes = hexToBytes(peerPublicKey);
      const conversation = await client.createDirectConversation(peerUserId, peerPubKeyBytes);

      const convData: StoredConversationData = {
        id: conversation.id,
        type: 'direct',
        members: conversation.members,
        admins: [],
        peerPublicKey: peerPublicKey,
        sessionKey: bytesToHex(conversation.sessionKey),
      };
      saveConversation(convData);
      setConversations(prev => [...prev, convData]);
      addConversation(conversation);
      
      setDialogMode(null);
      setPeerUserId('');
      setPeerPublicKey('');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !identity) {
      setError('Please wait for connection');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const conversation = await client.createGroupConversation(groupName);

      const convData: StoredConversationData = {
        id: conversation.id,
        type: 'group',
        name: groupName,
        members: conversation.members,
        admins: conversation.admins,
        sessionKey: bytesToHex(conversation.sessionKey),
      };
      saveConversation(convData);
      setConversations(prev => [...prev, convData]);
      addConversation(conversation);
      
      setDialogMode(null);
      setGroupName('');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !identity) {
      setError('Please wait for connection');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const invite = JSON.parse(inviteData);
      const { groupId, groupName: name, encryptedGroupKey, members = [], admins = [], keyVersion = 1 } = invite;

      if (!groupId) throw new Error('Invalid invite: missing groupId');
      if (!encryptedGroupKey) throw new Error('Invalid invite: missing encryptedGroupKey');

      const conversation = await client.joinGroupConversation({
        groupId,
        groupName: name || 'Unnamed Group',
        encryptedGroupKey: hexToBytes(encryptedGroupKey),
        members,
        admins,
        keyVersion,
      });

      const convData: StoredConversationData = {
        id: conversation.id,
        type: 'group',
        name: name || 'Unnamed Group',
        members: conversation.members,
        admins: conversation.admins,
        sessionKey: bytesToHex(conversation.sessionKey),
      };
      saveConversation(convData);
      setConversations(prev => [...prev, convData]);
      addConversation(conversation);
      
      setDialogMode(null);
      setInviteData('');
    } catch (error) {
      setError('Failed to join: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConversation = (id: string) => {
    if (confirm('Delete this conversation?')) {
      deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversation(null);
      }
    }
  };

  const handleExportIdentity = async () => {
    if (!identity) return;
    const password = prompt('Enter password to encrypt:');
    if (!password) return;

    try {
      const exported = await identity.export(password);
      const blob = new Blob([exported], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waku-identity-${identity.userId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError('Export failed: ' + (error as Error).message);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    // 简单的 toast 提示
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = `${label} copied!`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  };

  return (
    <div className="conversations-view">
      {/* 侧边栏 */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Chats</h2>
          <div className="sidebar-actions">
            <button className="btn-icon" onClick={() => setDialogMode('create-dm')} title="New Chat">
              💬
            </button>
            <button className="btn-icon" onClick={() => setDialogMode('create-group')} title="New Group">
              👥
            </button>
            <button className="btn-icon" onClick={() => setDialogMode('join-group')} title="Join Group">
              +
            </button>
          </div>
        </div>

        <div className="conversations-list">
          {conversations.length === 0 ? (
            <div className="empty-state">
              <p>No conversations</p>
              <p className="empty-hint">Start a new chat</p>
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
                onClick={() => setCurrentConversation(conv.id)}
              >
                <div className="conversation-avatar">
                  {conv.type === 'direct' ? '👤' : '👥'}
                </div>
                <div className="conversation-content">
                  <div className="conversation-name">
                    {conv.name || (conv.type === 'direct' ? 'Direct Message' : 'Group')}
                  </div>
                  <div className="conversation-preview">
                    {conv.members.length} member{conv.members.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="conversation-meta">
                  <button
                    className="conversation-delete btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(conv.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-row">
              <span className="user-label">Your ID</span>
              <span className="user-value">{truncate(identity?.userId || '', 16)}</span>
              <button 
                className="btn-copy"
                onClick={() => identity && copyToClipboard(identity.userId, 'User ID')}
              >
                Copy
              </button>
            </div>
            <div className="user-row">
              <span className="user-label">Public Key</span>
              <button 
                className="btn-copy"
                onClick={() => identity && copyToClipboard(bytesToHex(identity.publicKey), 'Public Key')}
              >
                Copy
              </button>
            </div>
            <button className="btn btn-secondary" onClick={handleExportIdentity} style={{ marginTop: '8px', width: '100%' }}>
              Export Identity
            </button>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      {currentConversationId ? (
        <ChatView />
      ) : (
        <div className="main-empty">
          <div className="main-empty-icon">💬</div>
          <p>Select a conversation to start chatting</p>
        </div>
      )}

      {/* 对话框 */}
      {dialogMode === 'create-dm' && (
        <div className="dialog-overlay" onClick={() => setDialogMode(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>New Direct Message</h3>
            <form onSubmit={handleCreateDM}>
              <div className="form-group">
                <label>Peer User ID</label>
                <input
                  type="text"
                  className="input"
                  value={peerUserId}
                  onChange={(e) => setPeerUserId(e.target.value)}
                  placeholder="Enter peer's user ID"
                  required
                />
              </div>
              <div className="form-group">
                <label>Peer Public Key (hex)</label>
                <textarea
                  value={peerPublicKey}
                  onChange={(e) => setPeerPublicKey(e.target.value)}
                  placeholder="Enter peer's public key"
                  rows={3}
                  required
                />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setDialogMode(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                  {isLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dialogMode === 'create-group' && (
        <div className="dialog-overlay" onClick={() => setDialogMode(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>New Group</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="form-group">
                <label>Group Name</label>
                <input
                  type="text"
                  className="input"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter group name"
                  required
                />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setDialogMode(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                  {isLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dialogMode === 'join-group' && (
        <div className="dialog-overlay" onClick={() => setDialogMode(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Join Group</h3>
            <form onSubmit={handleJoinGroup}>
              <div className="form-group">
                <label>Invite Data (JSON)</label>
                <textarea
                  value={inviteData}
                  onChange={(e) => setInviteData(e.target.value)}
                  placeholder="Paste invite data"
                  rows={6}
                  required
                />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setDialogMode(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                  {isLoading ? 'Joining...' : 'Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
