# Waku 加密聊天 SDK 设计文档

## 1. 系统架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      应用层 (Demo)                           │
│  ┌─────────────────┐              ┌─────────────────────┐   │
│  │    CLI Demo     │              │     Web Demo        │   │
│  └────────┬────────┘              └──────────┬──────────┘   │
└───────────┼──────────────────────────────────┼──────────────┘
            │                                  │
┌───────────┴──────────────────────────────────┴──────────────┐
│                     Chat SDK 核心层                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   ChatClient                          │   │
│  │  - init() / destroy()                                │   │
│  │  - createIdentity() / loadIdentity()                 │   │
│  │  - createConversation() / joinConversation()         │   │
│  │  - sendMessage() / subscribe()                       │   │
│  │  - revokeMessage() / deleteLocalMessage()            │   │
│  │  - fetchHistory()                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│  ┌─────────────┐  ┌────────┴───────┐  ┌─────────────────┐   │
│  │IdentityMgr  │  │ConversationMgr │  │  MessageHandler │   │
│  └─────────────┘  └────────────────┘  └─────────────────┘   │
│                            │                                 │
│  ┌─────────────┐  ┌────────┴───────┐  ┌─────────────────┐   │
│  │ CryptoModule│  │  StorageModule │  │  DedupeCache    │   │
│  └─────────────┘  └────────────────┘  └─────────────────┘   │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    Waku 协议适配层                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  WakuAdapter                          │   │
│  │  - Relay / LightPush / Filter / Store                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    Waku 网络层                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  nwaku   │  │  nwaku   │  │  nwaku   │  │  nwaku   │    │
│  │  node 1  │  │  node 2  │  │  node 3  │  │  node N  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 2. Waku 协议关键概念

### 2.1 pubsub topic vs content topic

**pubsub topic（路由层）**
- 定义消息在 P2P 网络中的传播范围
- 所有订阅同一 pubsub topic 的节点会收到该 topic 下的所有消息
- 本项目使用统一的 pubsub topic：`/waku/2/encrypted-chat/proto`
- 选择单一 pubsub topic 的原因：简化网络拓扑，确保消息可达性

**content topic（应用层）**
- 用于在 pubsub topic 内部进行消息过滤和分类
- 客户端可以只订阅感兴趣的 content topic
- 格式：`/encrypted-chat/1/{conversationType}/{conversationId}/proto`
  - conversationType: `dm`（单聊）或 `group`（群聊）
  - conversationId: 会话唯一标识

**示例**
```
pubsub topic: /waku/2/encrypted-chat/proto
content topics:
  - /encrypted-chat/1/dm/abc123def456/proto      (单聊)
  - /encrypted-chat/1/group/group789xyz/proto   (群聊)
```

### 2.2 Relay vs LightPush/Filter

**Relay 模式（全节点）**
- 节点参与消息路由，帮助转发其他节点的消息
- 优点：去中心化程度高，不依赖特定服务节点
- 缺点：资源消耗较大，需要维护与多个 peer 的连接
- 适用场景：桌面应用、服务器端、资源充足的环境

**LightPush + Filter 模式（轻节点）**
- LightPush：将消息推送给服务节点，由服务节点转发到网络
- Filter：向服务节点订阅特定 content topic，只接收匹配的消息
- 优点：资源消耗低，适合移动设备和浏览器
- 缺点：依赖服务节点，去中心化程度较低
- 适用场景：移动应用、Web 应用、资源受限环境

**本项目策略**
- 默认使用 Relay 模式以获得更好的去中心化特性
- 提供 `lightMode` 配置选项，启用后使用 LightPush + Filter
- 自动发现并连接支持相应协议的节点

### 2.3 消息唯一标识

使用自定义方案生成 messageId：
```
messageId = SHA256(timestamp + senderId + randomBytes(16))
```

**选择理由**
- 发送时即可确定 ID，无需等待网络确认
- 包含时间戳便于排序和追溯
- 包含发送者 ID 便于权限验证
- 随机字节防止碰撞

**与 Waku messageHash 的关系**
- Waku 的 messageHash 是基于整个消息内容计算的
- 我们的 messageId 在消息创建时生成，作为消息内容的一部分
- 两者可以共存，messageId 用于应用层逻辑，messageHash 用于网络层去重

### 2.4 撤回/删除的边界说明

**去中心化网络的现实约束**
1. 消息一旦发送到网络，会被多个节点接收和存储
2. 无法强制所有节点删除已存储的消息
3. 离线节点在上线后仍可能从 Store 节点获取到原消息
4. 恶意节点可能故意保留和传播已撤回的消息

**本项目的撤回实现方案**
1. 发送撤回控制消息（tombstone），包含被撤回的 messageId
2. 控制消息包含发送者签名，用于权限验证
3. 客户端收到撤回消息后，将对应消息标记为"已撤回"
4. UI 层显示"此消息已被撤回"而非原内容
5. 从 Store 拉取历史时，同时拉取撤回消息，合并处理

**边界声明**
- 撤回是"尽力而为"的逻辑删除，不是物理删除
- 已接收原消息但未收到撤回消息的客户端仍可看到原内容
- 恶意客户端可以选择忽略撤回消息
- 网络层和存储层可能仍保留原消息数据


## 3. 消息格式定义（Protobuf）

```protobuf
syntax = "proto3";
package encrypted_chat;

// 消息类型枚举
enum MessageType {
  TEXT = 0;           // 普通文本消息
  REVOKE = 1;         // 撤回控制消息
  KEY_EXCHANGE = 2;   // 密钥交换消息
  GROUP_INVITE = 3;   // 群组邀请
  GROUP_JOIN = 4;     // 加入群组
  GROUP_LEAVE = 5;    // 离开群组
  GROUP_KEY_UPDATE = 6; // 群组密钥更新
}

// 会话类型
enum ConversationType {
  DIRECT = 0;   // 单聊
  GROUP = 1;    // 群聊
}

// 聊天消息（加密前的明文结构）
message ChatMessage {
  string message_id = 1;        // 消息唯一标识
  string sender_id = 2;         // 发送者 ID
  string conversation_id = 3;   // 会话 ID
  ConversationType conv_type = 4; // 会话类型
  MessageType type = 5;         // 消息类型
  uint64 timestamp = 6;         // 发送时间戳（毫秒）
  bytes payload = 7;            // 消息内容（根据 type 解析）
  uint32 version = 8;           // 协议版本号
}

// 加密后的消息封装
message EncryptedEnvelope {
  bytes encrypted_payload = 1;  // 加密后的 ChatMessage
  bytes nonce = 2;              // AES-GCM nonce (12 bytes)
  bytes signature = 3;          // ECDSA 签名
  string sender_id = 4;         // 发送者 ID（明文，用于查找公钥验签）
  uint64 timestamp = 5;         // 时间戳（明文，用于排序）
  uint32 version = 6;           // 封装版本号
}

// 文本消息 payload
message TextPayload {
  string content = 1;           // 文本内容
}

// 撤回消息 payload
message RevokePayload {
  string target_message_id = 1; // 被撤回的消息 ID
  string reason = 2;            // 撤回原因（可选）
}

// 密钥交换 payload
message KeyExchangePayload {
  bytes ephemeral_public_key = 1; // 临时公钥
  bytes encrypted_session_key = 2; // 加密的会话密钥
  string target_user_id = 3;      // 目标用户 ID
}

// 群组邀请 payload
message GroupInvitePayload {
  string group_id = 1;          // 群组 ID
  string group_name = 2;        // 群组名称
  bytes encrypted_group_key = 3; // 加密的群组密钥
  repeated string member_ids = 4; // 成员列表
}

// 群组密钥更新 payload
message GroupKeyUpdatePayload {
  string group_id = 1;
  bytes encrypted_group_key = 2; // 用接收者公钥加密的新群组密钥
  uint32 key_version = 3;        // 密钥版本号
}
```

## 4. 安全方案设计

### 4.1 加密方案

**对称加密：AES-256-GCM**
- 用于加密消息内容
- 每条消息使用唯一的 12 字节 nonce
- 提供机密性和完整性保护（AEAD）

**非对称加密：secp256k1 + ECIES**
- 用于身份密钥对
- 用于密钥交换消息的加密
- 与以太坊/比特币生态兼容

### 4.2 密钥派生与管理

**单聊密钥派生**
```
1. 双方使用 ECDH 计算共享秘密：
   sharedSecret = ECDH(myPrivateKey, peerPublicKey)

2. 使用 HKDF 派生会话密钥：
   sessionKey = HKDF-SHA256(
     ikm: sharedSecret,
     salt: conversationId,
     info: "encrypted-chat-session-key",
     length: 32
   )
```

**群聊密钥管理**
```
1. 创建群组时生成随机群组密钥：
   groupKey = randomBytes(32)

2. 邀请成员时，用成员公钥加密群组密钥：
   encryptedGroupKey = ECIES.encrypt(memberPublicKey, groupKey)

3. 密钥更新时，生成新密钥并分发给所有成员
```

### 4.3 签名方案

**签名算法：ECDSA with secp256k1**

**签名内容**
```
signatureData = SHA256(
  messageId + 
  senderId + 
  conversationId + 
  timestamp + 
  messageType + 
  payloadHash
)
signature = ECDSA.sign(privateKey, signatureData)
```

**验签流程**
1. 从消息中提取 senderId
2. 查找 senderId 对应的公钥
3. 重新计算 signatureData
4. 验证签名：ECDSA.verify(publicKey, signatureData, signature)

### 4.4 撤回权限验证

**单聊撤回**
- 只有原发送者可以撤回
- 验证：撤回消息的 senderId == 原消息的 senderId

**群聊撤回**
- 原发送者可以撤回自己的消息
- 群管理员可以撤回任何人的消息
- 验证流程：
  1. 检查撤回者是否是原发送者
  2. 如果不是，检查撤回者是否是群管理员
  3. 验证撤回消息的签名

## 5. Topic 规划

### 5.1 pubsub topic
```
/waku/2/encrypted-chat/proto
```
所有消息使用同一个 pubsub topic，简化网络配置。

### 5.2 content topic 格式
```
/encrypted-chat/{version}/{type}/{id}/proto

version: 协议版本，当前为 1
type: 会话类型
  - dm: 单聊
  - group: 群聊
  - system: 系统消息（密钥交换等）
id: 会话标识
```

### 5.3 content topic 示例
```
单聊（Alice 和 Bob）:
  conversationId = SHA256(sort([aliceId, bobId]).join(':'))
  topic = /encrypted-chat/1/dm/{conversationId}/proto

群聊:
  conversationId = 创建时生成的 UUID
  topic = /encrypted-chat/1/group/{conversationId}/proto

密钥交换（发给特定用户）:
  topic = /encrypted-chat/1/system/{targetUserId}/proto
```

## 6. 核心模块设计

### 6.1 ChatClient（主入口）

```typescript
interface ChatClientConfig {
  // Waku 配置
  bootstrapNodes?: string[];
  lightMode?: boolean;  // 是否使用轻节点模式
  
  // 存储配置
  storagePath?: string;
  
  // 回调
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: Error) => void;
}

interface ChatClient {
  // 生命周期
  init(config: ChatClientConfig): Promise<void>;
  destroy(): Promise<void>;
  
  // 身份管理
  createIdentity(): Promise<Identity>;
  loadIdentity(data: string, password: string): Promise<Identity>;
  exportIdentity(password: string): Promise<string>;
  
  // 会话管理
  createDirectConversation(peerId: string): Promise<Conversation>;
  createGroupConversation(name: string): Promise<Conversation>;
  joinGroupConversation(groupId: string, inviteData: string): Promise<Conversation>;
  leaveConversation(conversationId: string): Promise<void>;
  getConversations(): Promise<Conversation[]>;
  
  // 消息操作
  sendMessage(conversationId: string, content: string): Promise<string>;
  subscribe(conversationId: string, handler: MessageHandler): Unsubscribe;
  revokeMessage(conversationId: string, messageId: string): Promise<void>;
  deleteLocalMessage(conversationId: string, messageId: string): Promise<void>;
  
  // 历史消息
  fetchHistory(conversationId: string, options?: HistoryOptions): Promise<Message[]>;
  
  // 群组管理
  inviteToGroup(groupId: string, userId: string): Promise<void>;
  setGroupAdmin(groupId: string, userId: string, isAdmin: boolean): Promise<void>;
  getGroupMembers(groupId: string): Promise<GroupMember[]>;
}
```

### 6.2 Identity（身份模块）

```typescript
interface Identity {
  userId: string;           // 基于公钥派生的用户 ID
  publicKey: Uint8Array;    // secp256k1 公钥
  privateKey: Uint8Array;   // secp256k1 私钥（内存中）
  
  sign(data: Uint8Array): Uint8Array;
  verify(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean;
  deriveSharedSecret(peerPublicKey: Uint8Array): Uint8Array;
}
```

### 6.3 Conversation（会话模块）

```typescript
interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  createdAt: number;
  members: string[];
  admins?: string[];  // 群聊管理员
  
  // 会话密钥（内存中）
  sessionKey: Uint8Array;
}
```

### 6.4 Message（消息模块）

```typescript
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'failed' | 'revoked';
  
  // 元数据
  signature: Uint8Array;
  verified: boolean;
}

type MessageHandler = (message: Message) => void;
type Unsubscribe = () => void;
```


## 7. WakuAdapter 设计

```typescript
interface WakuAdapterConfig {
  bootstrapNodes: string[];
  lightMode: boolean;
  pubsubTopic: string;
}

interface WakuAdapter {
  // 连接管理
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // 消息发送
  publish(contentTopic: string, payload: Uint8Array): Promise<void>;
  
  // 消息订阅
  subscribe(contentTopic: string, handler: (payload: Uint8Array) => void): Unsubscribe;
  
  // 历史查询
  queryHistory(contentTopic: string, options: QueryOptions): Promise<Uint8Array[]>;
}

interface QueryOptions {
  startTime?: number;
  endTime?: number;
  pageSize?: number;
  cursor?: Uint8Array;
}
```

### 7.1 Relay 模式实现

```typescript
class RelayWakuAdapter implements WakuAdapter {
  private node: LightNode;
  
  async connect() {
    this.node = await createLightNode({
      defaultBootstrap: true,
      // 启用 Relay
    });
    await this.node.start();
    await waitForRemotePeer(this.node, [Protocols.Relay]);
  }
  
  async publish(contentTopic: string, payload: Uint8Array) {
    const encoder = createEncoder({ contentTopic });
    await this.node.relay.send(encoder, { payload });
  }
  
  subscribe(contentTopic: string, handler: (payload: Uint8Array) => void) {
    const decoder = createDecoder(contentTopic);
    return this.node.relay.subscribe([decoder], (message) => {
      if (message.payload) {
        handler(message.payload);
      }
    });
  }
}
```

### 7.2 Light 模式实现

```typescript
class LightWakuAdapter implements WakuAdapter {
  private node: LightNode;
  
  async connect() {
    this.node = await createLightNode({
      defaultBootstrap: true,
    });
    await this.node.start();
    await waitForRemotePeer(this.node, [
      Protocols.LightPush,
      Protocols.Filter,
      Protocols.Store
    ]);
  }
  
  async publish(contentTopic: string, payload: Uint8Array) {
    const encoder = createEncoder({ contentTopic });
    await this.node.lightPush.send(encoder, { payload });
  }
  
  subscribe(contentTopic: string, handler: (payload: Uint8Array) => void) {
    const decoder = createDecoder(contentTopic);
    return this.node.filter.subscribe([decoder], (message) => {
      if (message.payload) {
        handler(message.payload);
      }
    });
  }
  
  async queryHistory(contentTopic: string, options: QueryOptions) {
    const decoder = createDecoder(contentTopic);
    const messages: Uint8Array[] = [];
    
    for await (const messagePromises of this.node.store.queryGenerator([decoder], options)) {
      const results = await Promise.all(messagePromises);
      for (const msg of results) {
        if (msg?.payload) {
          messages.push(msg.payload);
        }
      }
    }
    
    return messages;
  }
}
```

## 8. 可靠性机制

### 8.1 消息去重

```typescript
class DedupeCache {
  private cache: Map<string, number> = new Map();
  private maxSize: number = 10000;
  private ttl: number = 3600000; // 1 hour
  
  isDuplicate(messageId: string): boolean {
    const timestamp = this.cache.get(messageId);
    if (timestamp && Date.now() - timestamp < this.ttl) {
      return true;
    }
    return false;
  }
  
  add(messageId: string): void {
    // 清理过期条目
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    this.cache.set(messageId, Date.now());
  }
  
  private cleanup(): void {
    const now = Date.now();
    for (const [id, timestamp] of this.cache) {
      if (now - timestamp > this.ttl) {
        this.cache.delete(id);
      }
    }
  }
}
```

### 8.2 消息重发

```typescript
class MessageSender {
  private maxRetries = 3;
  private baseDelay = 1000; // 1 second
  
  async send(
    adapter: WakuAdapter,
    contentTopic: string,
    payload: Uint8Array
  ): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await adapter.publish(contentTopic, payload);
        return; // 成功
      } catch (error) {
        lastError = error as Error;
        // 指数退避
        const delay = this.baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
    
    throw new Error(`Failed to send after ${this.maxRetries} attempts: ${lastError?.message}`);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## 9. 存储模块

### 9.1 本地存储接口

```typescript
interface Storage {
  // 身份存储
  saveIdentity(identity: EncryptedIdentity): Promise<void>;
  loadIdentity(): Promise<EncryptedIdentity | null>;
  
  // 会话存储
  saveConversation(conversation: Conversation): Promise<void>;
  loadConversations(): Promise<Conversation[]>;
  deleteConversation(id: string): Promise<void>;
  
  // 消息存储
  saveMessage(message: Message): Promise<void>;
  loadMessages(conversationId: string, limit?: number): Promise<Message[]>;
  deleteMessage(messageId: string): Promise<void>;
  markAsRevoked(messageId: string): Promise<void>;
  
  // 已处理消息 ID（用于去重）
  saveProcessedMessageId(messageId: string): Promise<void>;
  isMessageProcessed(messageId: string): Promise<boolean>;
}
```

### 9.2 实现策略

- **Node.js 环境**：使用 LevelDB 或 SQLite
- **浏览器环境**：使用 IndexedDB
- **统一接口**：通过 Storage 接口抽象，运行时选择实现

## 10. 测试策略

### 10.1 单元测试

| 测试项 | 描述 | 验收标准 |
|--------|------|----------|
| 身份创建 | 测试密钥对生成 | 生成有效的 secp256k1 密钥对 |
| 身份导出/导入 | 测试身份持久化 | 导出后可正确导入恢复 |
| 消息加密/解密 | 测试 AES-GCM | 加密后可正确解密 |
| 签名/验签 | 测试 ECDSA | 签名可正确验证 |
| ECDH 密钥交换 | 测试共享密钥派生 | 双方派生相同密钥 |
| 消息序列化 | 测试 Protobuf | 序列化后可正确反序列化 |

### 10.2 集成测试

| 测试项 | 描述 | 验收标准 |
|--------|------|----------|
| 单聊互发 | 两用户互相发送消息 | 双方都能收到对方消息 |
| 群聊广播 | 三用户群聊 | 所有成员收到消息 |
| 消息撤回 | 发送后撤回 | 其他端显示已撤回 |
| 本地删除 | 删除本地消息 | 仅本地不可见 |
| 历史拉取 | 从 Store 拉取 | 正确获取历史消息 |

### 10.3 Property-Based Testing

使用 fast-check 进行属性测试：

```typescript
// 属性1：加密解密一致性
fc.assert(
  fc.property(fc.string(), fc.uint8Array({minLength: 32, maxLength: 32}), (plaintext, key) => {
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    return decrypted === plaintext;
  })
);

// 属性2：签名验证一致性
fc.assert(
  fc.property(fc.uint8Array(), (data) => {
    const { publicKey, privateKey } = generateKeyPair();
    const signature = sign(data, privateKey);
    return verify(data, signature, publicKey);
  })
);

// 属性3：ECDH 对称性
fc.assert(
  fc.property(fc.constant(null), () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const aliceShared = ecdh(alice.privateKey, bob.publicKey);
    const bobShared = ecdh(bob.privateKey, alice.publicKey);
    return arraysEqual(aliceShared, bobShared);
  })
);
```

## 11. 项目结构

```
waku-encrypted-chat/
├── packages/
│   ├── sdk/                    # Chat SDK 核心库
│   │   ├── src/
│   │   │   ├── index.ts        # 主入口
│   │   │   ├── client.ts       # ChatClient 实现
│   │   │   ├── identity.ts     # 身份管理
│   │   │   ├── conversation.ts # 会话管理
│   │   │   ├── message.ts      # 消息处理
│   │   │   ├── crypto/         # 加密模块
│   │   │   │   ├── aes.ts
│   │   │   │   ├── ecdsa.ts
│   │   │   │   ├── ecdh.ts
│   │   │   │   └── index.ts
│   │   │   ├── waku/           # Waku 适配层
│   │   │   │   ├── adapter.ts
│   │   │   │   ├── relay.ts
│   │   │   │   └── light.ts
│   │   │   ├── storage/        # 存储模块
│   │   │   │   ├── interface.ts
│   │   │   │   ├── leveldb.ts
│   │   │   │   └── indexeddb.ts
│   │   │   ├── proto/          # Protobuf 定义
│   │   │   │   └── messages.proto
│   │   │   └── types.ts        # 类型定义
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                    # CLI Demo
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── commands/
│   │   └── package.json
│   │
│   └── web/                    # Web Demo
│       ├── src/
│       │   ├── App.tsx
│       │   └── components/
│       └── package.json
│
├── docker/                     # Docker 配置
│   ├── docker-compose.yml
│   └── nwaku/
│
├── scripts/                    # 脚本
│   ├── start-local-network.sh
│   └── demo.sh
│
├── docs/
│   └── design.md
│
├── package.json                # Monorepo 根配置
├── pnpm-workspace.yaml
└── README.md
```

## 12. 正确性属性（Correctness Properties）

### CP1: 加密一致性
对于任意明文 M 和密钥 K，decrypt(encrypt(M, K), K) = M

### CP2: 签名不可伪造
对于任意消息 M，只有持有私钥的用户才能生成有效签名

### CP3: ECDH 对称性
对于任意两个密钥对 (a, A) 和 (b, B)，ECDH(a, B) = ECDH(b, A)

### CP4: 消息去重
相同 messageId 的消息只会被处理一次

### CP5: 撤回权限
只有原发送者或群管理员的撤回请求才会被接受

### CP6: 消息完整性
任何对消息内容的篡改都会导致签名验证失败

## 13. 技术栈

- **语言**: TypeScript 5.x
- **运行时**: Node.js 18+
- **Waku SDK**: @waku/sdk
- **加密库**: @noble/secp256k1, @noble/hashes
- **序列化**: protobufjs
- **测试**: Vitest, fast-check
- **CLI**: Commander.js, Inquirer.js
- **Web**: React 18, Vite
- **构建**: pnpm, tsup
- **容器**: Docker, docker-compose
