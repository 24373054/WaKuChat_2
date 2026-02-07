// Light mode adapter using LightPush and Filter protocols
import { createLightNode, waitForRemotePeer, Protocols } from '@waku/sdk';
import type { LightNode } from '@waku/sdk';
import { BaseWakuAdapter } from './base-adapter.js';
import type { MessageCallback, WakuUnsubscribe, WakuAdapterConfig } from './types.js';

/**
 * Light mode Waku adapter
 * Uses LightPush for sending and Filter for receiving messages
 * Suitable for resource-constrained environments (browsers, mobile)
 */
export class LightWakuAdapter extends BaseWakuAdapter {
  private bootstrapNodes?: string[];

  constructor(config: WakuAdapterConfig = {}) {
    super(config);
    this.bootstrapNodes = config.bootstrapNodes;
    console.log('LightWakuAdapter constructor, bootstrapNodes:', this.bootstrapNodes);
  }

  protected async createNode(): Promise<LightNode> {
    // 如果提供了 bootstrap nodes，使用它们；否则使用 DNS discovery
    if (this.bootstrapNodes && this.bootstrapNodes.length > 0) {
      console.log('Creating Waku light node with custom bootstrap nodes...');
      console.log('Bootstrap nodes:', this.bootstrapNodes);
      
      // 使用与工作版本 (WaKuChat_3) 完全相同的配置
      const node = await createLightNode({
        defaultBootstrap: false,
        bootstrapPeers: this.bootstrapNodes,
        numPeersToUse: 3,
        libp2p: {
          filterMultiaddrs: false
        },
        networkConfig: {
          clusterId: 0,
          numShardsInCluster: 8
        }
      });

      await node.start();
      console.log('Node started, local peer ID:', node.libp2p.peerId.toString());
      
      // 暴露 libp2p 实例用于调试
      (window as any).__DEBUG_LIBP2P__ = node.libp2p;
      (window as any).__DEBUG_WAKU__ = node;
      console.log('Debug: window.__DEBUG_LIBP2P__ and window.__DEBUG_WAKU__ available');
      
      // 等待连接到对等节点 - 使用 waitForRemotePeer（与工作版本相同）
      console.log('Connecting to Waku network...');
      console.log('Ignore WebSocket connection failures');
      console.log('Waku tries to discover peers and some of them are expected to fail');
      
      try {
        await waitForRemotePeer(node, [Protocols.LightPush, Protocols.Filter, Protocols.Store], 30000);
        console.log('✅ Connected to Waku network');
        console.log('Connected peers:', node.libp2p.getPeers().length);
      } catch (error) {
        console.warn('Warning: Could not connect to remote peers within timeout.');
        console.warn('Make sure local Waku network is running: npx @waku/run start');
        console.warn('Continuing anyway - messages may fail to send.');
        
        // 打印当前状态用于调试
        console.log('Current peers:', node.libp2p.getPeers().length);
        console.log('Current connections:', node.libp2p.getConnections().length);
      }
      
      return node;
    }
    
    // 公共网络：使用 DNS discovery（默认）
    // 公共 Waku 网络使用 clusterId=1
    console.log('Creating Waku light node with public network (DNS discovery)...');
    console.log('Note: Some WebSocket connection failures are expected during peer discovery');
    
    const node = await createLightNode({
      defaultBootstrap: true,
      numPeersToUse: 3,
      libp2p: {
        filterMultiaddrs: false
      },
      networkConfig: {
        clusterId: 1,  // 公共网络使用 clusterId=1
        numShardsInCluster: 8
      }
    });
    
    await node.start();
    console.log('Node started, local peer ID:', node.libp2p.peerId.toString());
    
    // 暴露 libp2p 实例用于调试
    if (typeof window !== 'undefined') {
      (window as any).__DEBUG_LIBP2P__ = node.libp2p;
      (window as any).__DEBUG_WAKU__ = node;
    }
    
    // 等待连接到公共网络
    console.log('Connecting to public Waku network...');
    try {
      await waitForRemotePeer(node, [Protocols.LightPush, Protocols.Filter, Protocols.Store], 30000);
      console.log('✅ Connected to public Waku network');
      console.log('Connected peers:', node.libp2p.getPeers().length);
    } catch (error) {
      console.warn('Warning: Could not connect to remote peers within timeout.');
      console.warn('The network may be slow. Will keep trying in background...');
      console.log('Current peers:', node.libp2p.getPeers().length);
      
      // 后台继续尝试连接
      this.startBackgroundConnection(node);
    }
    
    return node;
  }
  
  /**
   * 后台持续尝试连接到 peers
   */
  private startBackgroundConnection(node: LightNode): void {
    const checkInterval = setInterval(async () => {
      const peers = node.libp2p.getPeers();
      if (peers.length > 0) {
        console.log('✅ Background connection successful! Peers:', peers.length);
        clearInterval(checkInterval);
        return;
      }
      
      console.log('Still waiting for peers... (background)');
      try {
        await waitForRemotePeer(node, [Protocols.LightPush, Protocols.Filter], 10000);
        console.log('✅ Background connection successful!');
        clearInterval(checkInterval);
      } catch {
        // 继续尝试
      }
    }, 15000); // 每 15 秒检查一次
    
    // 5 分钟后停止尝试
    setTimeout(() => {
      clearInterval(checkInterval);
      const peers = node.libp2p.getPeers();
      if (peers.length === 0) {
        console.warn('Could not connect to Waku network after 5 minutes.');
        console.warn('Please check your network connection.');
      }
    }, 5 * 60 * 1000);
  }

  protected async waitForProtocols(): Promise<void> {
    // 已经在 createNode 中等待了，这里不需要再等待
    const node = this.getNode();
    const peers = node.libp2p.getPeers();
    console.log('waitForProtocols: Already connected to', peers.length, 'peer(s)');
  }

  async publish(contentTopic: string, payload: Uint8Array): Promise<void> {
    const node = this.getNode();
    const encoder = node.createEncoder({ contentTopic });
    
    const result = await node.lightPush.send(encoder, { payload });
    
    // 只要有一个成功就算成功（与工作版本一致）
    const hasSuccess = result.successes && result.successes.length > 0;
    const hasFailure = result.failures && result.failures.length > 0;
    
    if (hasSuccess) {
      // 有成功的发送，忽略部分失败
      if (hasFailure) {
        console.warn('Message sent with partial failures:', 
          result.failures.map(f => String(f.error || 'Unknown')).join(', '));
      }
      return;
    }
    
    // 全部失败
    if (hasFailure) {
      const errorMsg = result.failures.map(f => String(f.error || 'Unknown error')).join(', ');
      throw new Error('Failed to publish message: ' + errorMsg);
    }
  }

  async subscribe(contentTopic: string, handler: MessageCallback): Promise<WakuUnsubscribe> {
    const node = this.getNode();
    const decoder = node.createDecoder({ contentTopic });

    const callback = (message: { payload?: Uint8Array }) => {
      if (message.payload) {
        handler(message.payload);
      }
    };

    const subscribeResult = await node.filter.subscribe([decoder], callback);
    
    const syncUnsubscribe = () => {
      const result = subscribeResult as any;
      if (result && result.subscription && typeof result.subscription.unsubscribe === 'function') {
        result.subscription.unsubscribe([contentTopic]).catch(console.error);
      }
      this.subscriptions.delete(contentTopic);
    };
    
    this.subscriptions.set(contentTopic, syncUnsubscribe);
    return syncUnsubscribe;
  }
}
