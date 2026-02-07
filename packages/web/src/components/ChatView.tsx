/**
 * Chat View - 聊天界面
 * 简约现代风格
 */

import React, { useState, useEffect, useRef } from 'react';
import { Message, ChatClient } from '@waku-chat/sdk';
import { useApp } from '../context/AppContext.js';
import { getConversation, formatTimestamp, truncate, bytesToHex, hexToBytes } from '../utils/storage.js';
import './ChatView.css';

/**
 * 邀请生成器组件
 */
function InviteGenerator({ 
  client, 
  conversationId,
}: { 
  client: ChatClient | null;
  conversationId: string;
}) {
  const [inviteeUserId, setInviteeUserId] = useState('');
  const [inviteePublicKey, setInviteePublicKey] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateInvite = async () => {
    if (!client || !inviteeUserId.trim() || !inviteePublicKey.trim()) {
      setError('Enter both User ID and Public Key');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const pubKeyBytes = hexToBytes(inviteePublicKey.trim());
      const inviteData = await client.inviteToGroup(
        conversationId,
        inviteeUserId.trim(),
        pubKeyBytes
      );

      const inviteJson = JSON.stringify({
        groupId: inviteData.groupId,
        groupName: inviteData.groupName,
        encryptedGroupKey: bytesToHex(inviteData.encryptedGroupKey),
        members: inviteData.members,
        admins: inviteData.admins,
        keyVersion: inviteData.keyVersion,
      }, null, 2);

      setGeneratedInvite(inviteJson);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(generatedInvite);
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = 'Invite copied!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  };

  return (
    <div className="invite-section">
      <div className="form-group">
        <label>Invitee User ID</label>
        <input
          type="text"
          className="input"
          value={inviteeUserId}
          onChange={(e) => setInviteeUserId(e.target.value)}
          placeholder="Enter user ID"
        />
      </div>
      <div className="form-group">
        <label>Invitee Public Key</label>
        <textarea
          value={inviteePublicKey}
          onChange={(e) => setInviteePublicKey(e.target.value)}
          placeholder="Enter public key (hex)"
          rows={2}
        />
      </div>
      <button
        className="btn btn-primary"
        onClick={handleGenerateInvite}
        disabled={isGenerating || !inviteeUserId.trim() || !inviteePublicKey.trim()}
        style={{ width: '100%' }}
      >
        {isGenerating ? 'Generating...' : 'Generate Invite'}
      </button>

      {error && <div className="error-message">{error}</div>}

      {generatedInvite && (
        <div className="invite-result">
          <textarea value={generatedInvite} readOnly rows={8} />
          <button className="btn btn-secondary" onClick={handleCopyInvite} style={{ width: '100%', marginTop: '8px' }}>
            Copy Invite
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChatView() {
  const {
    identity,
    client,
    currentConversationId,
    messages: allMessages,
    addMessage,
    setCurrentConversation,
    setError,
  } = useApp();

  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversation = currentConversationId ? getConversation(currentConversationId) : null;
  const conversationMessages = currentConversationId ? allMessages.get(currentConversationId) || [] : [];

  useEffect(() => {
    if (!client || !currentConversationId) return;

    let unsubscribePromise: Promise<() => void> | null = null;

    const setupSubscription = async () => {
      try {
        unsubscribePromise = client.subscribe(currentConversationId, (message: Message) => {
          addMessage(currentConversationId, message);
          scrollToBottom();
        });
        await unsubscribePromise;
      } catch (error) {
        console.warn('Subscribe failed:', error);
      }
    };

    setupSubscription();
    fetchHistory();

    return () => {
      if (unsubscribePromise) {
        unsubscribePromise.then(unsub => unsub()).catch(() => {});
      }
    };
  }, [currentConversationId, client]);

  useEffect(() => {
    scrollToBottom();
  }, [conversationMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchHistory = async () => {
    if (!client || !currentConversationId) return;

    setIsFetchingHistory(true);
    try {
      const history = await client.fetchHistory(currentConversationId, { limit: 50 });
      history.forEach(msg => addMessage(currentConversationId, msg));
    } catch (error) {
      console.error('Fetch history failed:', error);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !currentConversationId || !messageText.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const messageId = await client.sendMessage(currentConversationId, messageText.trim());
      
      const message: Message = {
        id: messageId,
        conversationId: currentConversationId,
        senderId: identity!.userId,
        type: 'TEXT',
        content: messageText.trim(),
        timestamp: Date.now(),
        status: 'sent',
        signature: new Uint8Array(),
        verified: true,
      };
      addMessage(currentConversationId, message);
      setMessageText('');
      scrollToBottom();
    } catch (error) {
      setError('Send failed: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeMessage = async (messageId: string) => {
    if (!client || !currentConversationId) return;
    if (!confirm('Revoke this message?')) return;

    try {
      await client.revokeMessage(currentConversationId, messageId);
    } catch (error) {
      setError('Revoke failed: ' + (error as Error).message);
    }
  };

  if (!conversation) {
    return null;
  }

  return (
    <div className="chat-view">
      {/* 头部 */}
      <div className="chat-header">
        <button className="btn-icon chat-back" onClick={() => setCurrentConversation(null)}>
          ←
        </button>
        <div className="chat-avatar">
          {conversation.type === 'direct' ? '👤' : '👥'}
        </div>
        <div className="chat-info">
          <div className="chat-name">{conversation.name || 'Conversation'}</div>
          <div className="chat-status">
            {conversation.members.length} member{conversation.members.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="chat-actions">
          <button className="btn-icon" onClick={fetchHistory} disabled={isFetchingHistory} title="Refresh">
            ↻
          </button>
          {conversation.type === 'group' && (
            <button className="btn-icon" onClick={() => setShowGroupInfo(true)} title="Info">
              ℹ
            </button>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <div className="chat-messages">
        {isFetchingHistory && conversationMessages.length === 0 && (
          <div className="chat-loading">
            <div className="spinner"></div>
            <p>Loading messages...</p>
          </div>
        )}

        {conversationMessages.length === 0 && !isFetchingHistory && (
          <div className="chat-empty-messages">
            <p>No messages yet</p>
            <p style={{ fontSize: '13px', color: 'var(--text-hint)' }}>Send a message to start</p>
          </div>
        )}

        {conversationMessages.map((msg, index) => {
          const isOwn = msg.senderId === identity?.userId;
          const showSender = !isOwn && (
            index === 0 || conversationMessages[index - 1].senderId !== msg.senderId
          );

          return (
            <div key={msg.id} className={`message ${isOwn ? 'message-own' : 'message-other'}`}>
              {showSender && (
                <div className="message-sender">{truncate(msg.senderId, 12)}</div>
              )}
              <div className="message-bubble">
                {msg.status === 'revoked' ? (
                  <div className="message-revoked">Message revoked</div>
                ) : (
                  <div className="message-content">{msg.content}</div>
                )}
                <div className="message-footer">
                  <span className="message-time">{formatTimestamp(msg.timestamp)}</span>
                  {msg.verified && <span className="message-verified">✓</span>}
                  {isOwn && msg.status !== 'revoked' && (
                    <button className="message-revoke" onClick={() => handleRevokeMessage(msg.id)}>
                      ⟲
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="chat-input-area">
        <form className="chat-input-form" onSubmit={handleSendMessage}>
          <input
            type="text"
            className="chat-input"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
          />
          <button
            type="submit"
            className="chat-send"
            disabled={isLoading || !messageText.trim()}
          >
            {isLoading ? '...' : '➤'}
          </button>
        </form>
      </div>

      {/* 群组信息面板 */}
      {showGroupInfo && conversation.type === 'group' && (
        <div className="group-info-overlay" onClick={() => setShowGroupInfo(false)}>
          <div className="group-info-panel" onClick={(e) => e.stopPropagation()}>
            <div className="group-info-header">
              <h3>Group Info</h3>
              <button className="btn-close" onClick={() => setShowGroupInfo(false)}>×</button>
            </div>

            <div className="group-info-content">
              <div className="info-section">
                <div className="info-label">Group Name</div>
                <div className="info-value">{conversation.name || 'Unnamed Group'}</div>
              </div>

              <div className="info-section">
                <div className="info-label">Group ID</div>
                <div className="info-value info-mono">{truncate(conversation.id, 32)}</div>
              </div>

              <div className="info-section">
                <div className="info-label">Members ({conversation.members.length})</div>
                <div className="members-list">
                  {conversation.members.map(memberId => {
                    const isAdmin = conversation.admins.includes(memberId);
                    const isMe = memberId === identity?.userId;
                    return (
                      <div key={memberId} className="member-item">
                        <div className="member-avatar">
                          {memberId.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="member-info">
                          <div className="member-id">{truncate(memberId, 20)}</div>
                          {isMe && <span className="member-badge">(You)</span>}
                        </div>
                        {isAdmin && <span className="admin-badge">Admin</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="info-section">
                <div className="info-label">Invite Member</div>
                <InviteGenerator client={client} conversationId={conversation.id} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
