/**
 * App Context - Global state management
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ChatClient, Identity, Conversation, Message } from '@waku-chat/sdk';
import type { AppState, AppView } from '../types.js';

interface AppContextValue extends AppState {
  client: ChatClient | null;
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  setIdentity: (identity: Identity) => void;
  initializeClient: (identity?: Identity) => Promise<void>;
  destroyClient: () => Promise<void>;
  addConversation: (conversation: Conversation) => void;
  setCurrentConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<ChatClient | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('identity');
  const [state, setState] = useState<AppState>({
    identity: null,
    conversations: [],
    currentConversationId: null,
    messages: new Map(),
    isConnected: false,
    isLoading: false,
    error: null,
  });

  const setIdentity = useCallback((identity: Identity) => {
    setState(prev => ({ ...prev, identity }));
    // 不再自动切换视图，让调用者决定何时切换
  }, []);

  const initializeClient = useCallback(async (identityToUse?: Identity) => {
    const identity = identityToUse || state.identity;
    if (!identity) {
      throw new Error('No identity set');
    }

    console.log('initializeClient: Starting...');
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // 动态导入 SDK，避免在页面加载时就导入
      console.log('initializeClient: Importing ChatClient...');
      const { ChatClient, createIndexedDBBackend } = await import('@waku-chat/sdk');
      console.log('initializeClient: ChatClient imported, creating IndexedDB backend...');
      
      // 使用 IndexedDB 持久化存储（刷新页面后数据不丢失）
      const storageBackend = await createIndexedDBBackend('waku-chat-storage');
      const newClient = new ChatClient(storageBackend);
      console.log('initializeClient: ChatClient created, calling init...');
      
      // 网络模式：
      // - 默认连接公共 Waku 网络（无需服务器）
      // - ?mock=true: Mock 模式，本地开发测试
      // - ?local=true: 连接本地 @waku/run 网络
      const useMockMode = window.location.search.includes('mock=true');
      const useLocalNetwork = window.location.search.includes('local=true');
      // usePublicNetwork = !useMockMode && !useLocalNetwork (implicit default)
      
      // 本地 nwaku 节点的 WebSocket 地址
      // 使用 @waku/run 启动的本地网络
      let bootstrapNodes: string[] | undefined;
      if (useLocalNetwork) {
        // @waku/run 启动的本地网络，使用两个节点
        // 端口可通过环境变量 NODE1_WS_PORT/NODE2_WS_PORT 自定义（默认 51000/51001）
        try {
          // 获取两个节点的信息
          const [info1, info2] = await Promise.all([
            fetch('/nwaku-api-1/debug/v1/info').then(r => r.json()).catch(() => null),
            fetch('/nwaku-api-2/debug/v1/info').then(r => r.json()).catch(() => null),
          ]);
          
          bootstrapNodes = [];
          if (info1?.listenAddresses?.[0]) {
            const peerId1 = info1.listenAddresses[0].split('/p2p/')[1];
            if (peerId1) bootstrapNodes.push(`/ip4/127.0.0.1/tcp/51000/ws/p2p/${peerId1}`);
          }
          if (info2?.listenAddresses?.[0]) {
            const peerId2 = info2.listenAddresses[0].split('/p2p/')[1];
            if (peerId2) bootstrapNodes.push(`/ip4/127.0.0.1/tcp/51001/ws/p2p/${peerId2}`);
          }
          
          if (bootstrapNodes.length > 0) {
            console.log('🔗 Connecting to local nwaku nodes:', bootstrapNodes);
          } else {
            throw new Error('No peer info found');
          }
        } catch (e) {
          // 如果无法获取节点信息，使用硬编码的地址
          // 这些是 @waku/run 启动时输出的地址（每次启动会变）
          console.warn('⚠ Could not fetch local node info, using hardcoded peers');
          bootstrapNodes = [
            '/ip4/127.0.0.1/tcp/51000/ws/p2p/16Uiu2HAmF6oAsd23RMAnZb3NJgxXrExxBTPMdEoih232iAZkviU2',
            '/ip4/127.0.0.1/tcp/51001/ws/p2p/16Uiu2HAm5aZU47YkiUoARqivbCXwuFPzFFXXiURAorySqAQbL6EQ',
          ];
          console.log('🔗 Using hardcoded bootstrap peers');
        }
      }
      
      if (useMockMode) {
        console.log('🔧 Using Mock Waku mode (local development)');
        console.log('   Messages work across browser tabs');
      } else if (useLocalNetwork) {
        console.log('🏠 Connecting to local Waku network...');
        console.log('   bootstrapNodes:', bootstrapNodes);
      } else {
        console.log('🌐 Connecting to public Waku network...');
        console.log('   This may take a moment...');
      }
      
      console.log('Calling newClient.init with config:', {
        lightMode: true,
        mockMode: useMockMode,
        bootstrapNodes: bootstrapNodes,
      });
      
      await newClient.init({
        lightMode: true,
        mockMode: useMockMode,
        bootstrapNodes: bootstrapNodes,
        onConnectionChange: (connected) => {
          console.log('initializeClient: Connection changed:', connected);
          setState(prev => ({ ...prev, isConnected: connected }));
        },
        onError: (error) => {
          console.error('Client error:', error);
          setState(prev => ({ ...prev, error: error.message }));
        },
      });
      
      console.log('initializeClient: init completed, setting identity...');

      await newClient.setIdentity(identity);
      setClient(newClient);
      setState(prev => ({ ...prev, identity, isConnected: true, isLoading: false }));
      console.log('initializeClient: Success! Switching to conversations view...');
      
      // 连接成功后切换到会话视图
      setCurrentView('conversations');
    } catch (error) {
      console.error('initializeClient: Error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: (error as Error).message,
      }));
      throw error;
    }
  }, [state.identity]);

  const destroyClient = useCallback(async () => {
    if (client) {
      await client.destroy();
      setClient(null);
      setState(prev => ({ ...prev, isConnected: false }));
    }
  }, [client]);

  const addConversation = useCallback((conversation: Conversation) => {
    setState(prev => ({
      ...prev,
      conversations: [...prev.conversations, conversation],
    }));
  }, []);

  const setCurrentConversation = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, currentConversationId: id }));
    if (id) {
      setCurrentView('chat');
    }
  }, []);

  const addMessage = useCallback((conversationId: string, message: Message) => {
    setState(prev => {
      const messages = new Map(prev.messages);
      const convMessages = messages.get(conversationId) || [];
      
      // Check if message already exists
      const existingIndex = convMessages.findIndex(m => m.id === message.id);
      
      if (existingIndex >= 0) {
        // Update existing message (e.g., for revoke status update)
        const updatedMessages = [...convMessages];
        updatedMessages[existingIndex] = {
          ...updatedMessages[existingIndex],
          ...message,
        };
        messages.set(conversationId, updatedMessages);
      } else {
        // Add new message
        messages.set(conversationId, [...convMessages, message]);
      }
      
      return { ...prev, messages };
    });
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (client) {
        client.destroy();
      }
    };
  }, [client]);

  const value: AppContextValue = {
    ...state,
    client,
    currentView,
    setCurrentView,
    setIdentity,
    initializeClient,
    destroyClient,
    addConversation,
    setCurrentConversation,
    addMessage,
    setError,
    clearError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
