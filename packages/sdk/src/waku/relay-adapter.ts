// Relay mode adapter using Relay protocol
import { createLightNode, waitForRemotePeer, Protocols } from '@waku/sdk';
import type { LightNode } from '@waku/sdk';
import { BaseWakuAdapter } from './base-adapter.js';
import type { MessageCallback, WakuUnsubscribe } from './types.js';

/**
 * Relay mode Waku adapter
 * 
 * Note: In @waku/sdk v0.0.27+, the LightNode type doesn't include relay.
 * This adapter provides a relay-like interface but uses light protocols
 * as the underlying implementation. For true relay functionality,
 * consider using a full node setup.
 * 
 * This adapter is kept for API compatibility and future relay support.
 */
export class RelayWakuAdapter extends BaseWakuAdapter {
  protected async createNode(): Promise<LightNode> {
    const node = await createLightNode({
      defaultBootstrap: true,
      bootstrapPeers: this.config.bootstrapNodes,
    });
    return node;
  }

  protected async waitForProtocols(): Promise<void> {
    const node = this.getNode();
    // Use light protocols since relay may not be available in LightNode
    await waitForRemotePeer(node, [Protocols.LightPush, Protocols.Filter]);
  }

  async publish(contentTopic: string, payload: Uint8Array): Promise<void> {
    const node = this.getNode();
    const encoder = node.createEncoder({ contentTopic });

    // Use lightPush for publishing
    const result = await node.lightPush.send(encoder, { payload });
    
    // Check for failures in the result
    if (result && result.failures && result.failures.length > 0) {
      const errorMsg = result.failures.map(f => String(f.error || 'Unknown error')).join(', ');
      throw new Error(`Failed to publish message: ${errorMsg}`);
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

    // 使用 filter.subscribe 直接订阅
    const subscribeResult = await node.filter.subscribe([decoder], callback);
    
    // 创建同步的取消订阅函数
    const syncUnsubscribe = () => {
      // subscribeResult 可能包含 subscription 对象
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
