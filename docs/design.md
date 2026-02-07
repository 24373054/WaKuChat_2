# Waku 加密聊天 SDK 设计文档

## 1. 项目概述

基于 Waku 去中心化 P2P 通信协议封装的端到端加密聊天 SDK，支持单聊、群聊、消息撤回与删除。

### 1.1 功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 单聊 (1:1) | ✅ | ECDH 派生会话密钥 |
| 群聊 (N:N) | ✅ | 群组密钥 + ECIES 分发 |
| 消息撤回 | ✅ | tombstone 控制消息 |
| 本地删除 | ✅ | 仅影响本地存储 |
| 历史消息 | ✅ | Store 协议拉取 |
| 轻节点模式 | ✅ | LightPush + Filter |
| 消息去重 | ✅ | messageId 去重缓存 |
| 消息重发 | ✅ | 指数退避重试 |
| 权限模型 | ✅ | 群管理员可撤回他人消息 |

### 1.2 系统架构

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
│  │  - createDirectConversation() / createGroupConversation()│
│  │  - sendMessage() / subscribe()                       │   │
│  │  - revokeMessage() / deleteLocalMessage()            │   │
│  │  - fetchHistory()                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│  ┌─────────────┐  ┌────────┴───────┐  ┌─────────────────┐   │
│  │  Identity   │  │ConversationMgr │  │  MessageSender  │   │
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
│  │  - LightAdapter (LightPush + Filter + Store)         │   │
│  │  - RelayAdapter (Relay + Store)                      │   │
│  │  - MockAdapter (本地开发测试)                          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    Waku 网络层                               │
│         公共 Waku 网络 / 本地 @waku/run 节点                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Waku 协议关键概念

### 2.1 pubsub topic vs content topic

| 概念 | 层级 | 作用 | 本项目使用 |
|------|------|------|-----------|
| pubsub topic | 路由层 | 定义消息在 P2P 网络中的传播范围 | `/waku/2/default-waku/proto` |
| content topic | 应用层 | 在 pubsub topic 内部进行消息过滤 | `/encrypted-chat/1/{type}/{id}/proto` |

**pubsub topic**：所有订阅同一 pubsub topic 的节点会收到该 topic 下的所有消息。本项目使用 Waku 默认的 pubsub topic，确保与公共网络兼容。

**content topic**：客户端可以只订阅感兴趣的 content topic，实现应用层的消息过滤。格式设计：

```
/encrypted-chat/1/{conversationType}/{conversationId}/proto

示例：
- 单聊: /encrypted-chat/1/dm/a1b2c3d4e5f6.../proto
- 群聊: /encrypted-chat/1/group/g1h2i3j4k5l6.../proto
```

### 2.2 为什么选择 LightPush/Filter（轻节点）

本项目默认使用轻节点模式，原因如下：

| 对比项 | Relay（全节点） | LightPush/Filter（轻节点） |
|--------|----------------|---------------------------|
| 资源消耗 | 高（参与消息路由） | 低（仅收发自己的消息） |
| 网络带宽 | 高 | 低 |
| 启动时间 | 慢（需要建立路由表） | 快 |
| 适用场景 | 服务器、桌面应用 | Web 应用、移动端 |
| 去中心化程度 | 高 | 依赖服务节点 |

**选择理由**：
1. Web 应用是主要使用场景，资源受限
2. 公共 Waku 网络提供了足够的服务节点
3. 轻节点模式启动快，用户体验好

**实现代码** (`packages/sdk/src/waku/light-adapter.ts`)：
```typescript
// 使用 LightPush 发送消息
async publish(contentTopic: string, payload: Uint8Array): Promise<void> {
  const result = await this.node.lightPush.send(encoder, { payload });
  // 处理结果...
}

// 使用 Filter 订阅消息
async subscribe(contentTopic: string, handler: MessageHandler): Promise<Unsubscribe> {
  const subscription = await this.node.filter.subscribe([decoder], handler);
  return () => subscription.unsubscribe([contentTopic]);
}

// 使用 Store 拉取历史
async queryHistory(contentTopic: string, options?: QueryOptions): Promise<QueryResult> {
  const messages = await this.node.store.queryWithOrderedCallback([decoder], callback, options);
  return { messages };
}
```

### 2.3 消息唯一标识

使用自定义方案生成 messageId：

```
messageId = hex(SHA256(timestamp + senderId + random16bytes)[0:16])
```

**设计考虑**：
- 包含时间戳：便于排序和去重
- 包含发送者 ID：防止不同用户生成相同 ID
- 包含随机数：防止同一用户同一时刻发送多条消息时冲突
- 截取 16 字节：足够唯一，又不会太长

**可追溯性**：messageId 可用于：
1. 消息去重
2. 撤回时指定目标消息
3. 历史消息查询时的游标

---

## 3. 消息格式定义（Protobuf）

### 3.1 消息类型

```protobuf
enum MessageType {
  TEXT = 0;           // 文本消息
  REVOKE = 1;         // 撤回控制消息
  KEY_EXCHANGE = 2;   // 密钥交换（预留）
  GROUP_INVITE = 3;   // 群组邀请（预留）
}

enum ConversationType {
  DIRECT = 0;         // 单聊
  GROUP = 1;          // 群聊
}
```

### 3.2 消息结构

```protobuf
// 聊天消息（加密前）
message ChatMessage {
  string message_id = 1;        // 消息唯一标识
  string sender_id = 2;         // 发送者 ID
  string conversation_id = 3;   // 会话 ID
  ConversationType conv_type = 4;
  MessageType type = 5;
  uint64 timestamp = 6;         // 毫秒时间戳
  bytes payload = 7;            // 类型相关的载荷
  uint32 version = 8;           // 协议版本
}

// 加密信封（网络传输格式）
message EncryptedEnvelope {
  bytes encrypted_payload = 1;  // AES-GCM 加密的 ChatMessage
  bytes nonce = 2;              // 12 字节随机数
  bytes signature = 3;          // ECDSA 签名
  string sender_id = 4;         // 发送者 ID（明文，用于路由）
  uint64 timestamp = 5;         // 时间戳（明文，用于排序）
  uint32 version = 6;
}

// 文本消息载荷
message TextPayload {
  string content = 1;
}

// 撤回消息载荷
message RevokePayload {
  string target_message_id = 1; // 被撤回的消息 ID
  string reason = 2;            // 撤回原因（可选）
}
```

---

## 4. 安全方案

### 4.1 加密方案选择

本项目**自行实现**端到端加密，而非使用 Waku 的 payload 加密方案（如 WAKU2-NOISE），原因：

1. **灵活性**：可以针对单聊/群聊使用不同的密钥派生策略
2. **可控性**：完全掌控加密流程，便于调试和审计
3. **简单性**：WAKU2-NOISE 主要用于节点间通信，对应用层消息加密过于复杂

### 4.2 加密算法

| 用途 | 算法 | 说明 |
|------|------|------|
| 消息加密 | AES-256-GCM | 对称加密，提供机密性和完整性 |
| 密钥交换 | ECDH (secp256k1) | 单聊会话密钥派生 |
| 消息签名 | ECDSA (secp256k1) | 防篡改，身份验证 |
| 群组密钥分发 | ECIES | 加密群组密钥给新成员 |
| 密钥派生 | HKDF-SHA256 | 从共享密钥派生会话密钥 |

### 4.3 单聊密钥派生

```
1. Alice 和 Bob 各有密钥对 (a, A) 和 (b, B)
2. 共享密钥: sharedSecret = ECDH(a, B) = ECDH(b, A)
3. 会话密钥: sessionKey = HKDF(sharedSecret, conversationId, "encrypted-chat-session-key", 32)
4. 会话 ID: conversationId = SHA256(sort(userId1, userId2).join(':'))[0:16]
```

**特点**：
- 相同的两个用户总是派生出相同的会话 ID 和会话密钥
- 无需额外的密钥交换消息

### 4.4 群聊密钥管理

```
1. 创建群组时，生成随机群组密钥 groupKey
2. 邀请成员时，使用 ECIES 加密 groupKey 给该成员
3. 成员加入时，使用自己的私钥解密获得 groupKey
4. 所有成员使用相同的 groupKey 加密消息
```

**ECIES 加密流程**：
```
encrypt(recipientPublicKey, groupKey):
  1. 生成临时密钥对 (e, E)
  2. sharedSecret = ECDH(e, recipientPublicKey)
  3. encKey = HKDF(sharedSecret, "ecies-encryption")
  4. ciphertext = AES-GCM(encKey, groupKey)
  5. return E || nonce || ciphertext
```

### 4.5 消息签名

每条消息都包含 ECDSA 签名，签名内容：
```
signedData = messageId || senderId || conversationId || timestamp || messageType || payload
signature = ECDSA.sign(SHA256(signedData), senderPrivateKey)
```

**验证流程**：
1. 接收方从消息中提取签名
2. 使用发送者公钥验证签名
3. 签名无效的消息被丢弃

---

## 5. 撤回与删除

### 5.1 撤回机制

**撤回 vs 删除**：

| 操作 | 影响范围 | 网络消息 | 其他用户 |
|------|---------|---------|---------|
| 撤回 | 所有参与者 | 发送 tombstone | 看到"已撤回" |
| 删除 | 仅本地 | 无 | 不受影响 |

**撤回流程**：
```
1. 用户 A 发送消息 M (messageId = "abc123")
2. 用户 A 决定撤回
3. A 发送撤回消息: { type: REVOKE, payload: { targetMessageId: "abc123" } }
4. B 和 C 收到撤回消息
5. B 和 C 验证权限（A 是原发送者）
6. B 和 C 将 "abc123" 标记为已撤回
7. UI 显示"此消息已被撤回"
```

### 5.2 撤回权限

```typescript
function canRevoke(revokerId: string, originalSenderId: string, conversation: Conversation): boolean {
  // 原发送者可以撤回自己的消息
  if (revokerId === originalSenderId) {
    return true;
  }
  
  // 群聊中，管理员可以撤回任何人的消息
  if (conversation.type === 'group' && conversation.admins.includes(revokerId)) {
    return true;
  }
  
  return false;
}
```

### 5.3 去中心化网络中撤回的边界

**现实约束**：

1. **无法强制删除**：消息一旦发送到网络，会被多个节点接收和存储。没有中心化的权威可以强制所有节点删除数据。

2. **Store 节点保留**：Store 节点会保存历史消息，即使发送了撤回消息，原消息仍可能存在于 Store 中。

3. **离线用户**：离线用户上线后，可能先收到原消息，再收到撤回消息。需要客户端正确处理这种时序。

4. **恶意节点**：恶意节点可能故意保留和传播已撤回的消息。

**本项目的解决方案**：

1. **tombstone 机制**：撤回消息作为控制消息发送，包含被撤回的 messageId 和发送者签名。

2. **历史合并**：从 Store 拉取历史时，同时拉取撤回消息，先处理撤回再显示消息。

3. **本地标记**：客户端在本地存储中标记已撤回的消息，即使重新收到原消息也不显示。

4. **UI 处理**：已撤回的消息显示为"此消息已被撤回"，而非完全隐藏（让用户知道曾有消息）。

**诚实声明**：本方案只能保证"诚实客户端"正确处理撤回。无法阻止：
- 用户在撤回前截图
- 恶意客户端忽略撤回消息
- 第三方从网络中抓取原始消息

---

## 6. 可靠性保障

### 6.1 消息去重

使用内存缓存 + TTL 机制：

```typescript
class DedupeCache {
  private cache: Map<string, number> = new Map();
  private maxSize = 10000;
  private ttl = 3600000; // 1 小时

  checkAndAdd(messageId: string): boolean {
    if (this.isDuplicate(messageId)) {
      return true; // 是重复消息
    }
    this.add(messageId);
    return false;
  }
}
```

### 6.2 消息重发

指数退避重试策略：

```typescript
class MessageSender {
  private maxRetries = 3;
  private baseDelay = 1000;

  async send(adapter: WakuAdapter, topic: string, payload: Uint8Array): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await adapter.publish(topic, payload);
        return;
      } catch (error) {
        const delay = this.baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
    throw new Error('Failed after max retries');
  }
}
```

---

## 7. 身份与存储

### 7.1 身份管理

每个用户有一个 secp256k1 密钥对：

```typescript
class Identity {
  userId: string;      // hex(SHA256(publicKey)[0:16])
  publicKey: Uint8Array;
  privateKey: Uint8Array;

  static create(): Identity {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey, true);
    const userId = generateUserId(publicKey);
    return new Identity(userId, publicKey, privateKey);
  }

  async export(password: string): Promise<string> {
    // 使用 AES-GCM 加密私钥，密钥从密码派生
    const key = await deriveKeyFromPassword(password);
    const encrypted = await encrypt(this.privateKey, key);
    return JSON.stringify({ userId, publicKey, encrypted });
  }

  static async import(data: string, password: string): Promise<Identity> {
    const { userId, publicKey, encrypted } = JSON.parse(data);
    const key = await deriveKeyFromPassword(password);
    const privateKey = await decrypt(encrypted, key);
    return new Identity(userId, publicKey, privateKey);
  }
}
```

### 7.2 存储后端

| 环境 | 后端 | 说明 |
|------|------|------|
| 浏览器 | IndexedDB | 持久化，刷新不丢失 |
| Node.js | LevelDB | 文件存储 |
| 测试 | InMemory | 内存存储 |

---

## 8. SDK API

### 8.1 初始化

```typescript
import { ChatClient, Identity } from '@waku-chat/sdk';

const client = new ChatClient();
await client.init({
  lightMode: true,           // 使用轻节点模式
  bootstrapNodes: [...],     // 可选，自定义引导节点
  onConnectionChange: (connected) => { ... },
  onError: (error) => { ... },
});
```

### 8.2 身份管理

```typescript
// 创建新身份
const identity = Identity.create();
await client.setIdentity(identity);

// 导出身份（加密）
const exported = await identity.export('password');

// 导入身份
const identity = await Identity.import(exported, 'password');
```

### 8.3 会话管理

```typescript
// 创建单聊
const dm = await client.createDirectConversation(peerUserId, peerPublicKey);

// 创建群聊
const group = await client.createGroupConversation('Group Name');

// 邀请成员
const invite = await client.inviteToGroup(groupId, userId, userPublicKey);

// 加入群聊
const group = await client.joinGroupConversation(inviteData);
```

### 8.4 消息收发

```typescript
// 发送消息
const messageId = await client.sendMessage(conversationId, 'Hello!');

// 订阅消息
const unsubscribe = await client.subscribe(conversationId, (message) => {
  console.log(`${message.senderId}: ${message.content}`);
});

// 拉取历史
const history = await client.fetchHistory(conversationId, { limit: 50 });
```

### 8.5 撤回与删除

```typescript
// 撤回消息（通知所有参与者）
await client.revokeMessage(conversationId, messageId);

// 本地删除（仅本地）
await client.deleteLocalMessage(conversationId, messageId);
```

---

## 9. 项目结构

```
packages/
├── sdk/                      # 核心 SDK
│   └── src/
│       ├── client/           # ChatClient 主类
│       ├── identity/         # 身份管理
│       ├── conversation/     # 会话管理
│       ├── message/          # 消息处理（序列化、签名、去重、重发）
│       ├── crypto/           # 加密模块（AES、ECDH、ECDSA、ECIES）
│       ├── waku/             # Waku 适配层
│       ├── storage/          # 存储模块
│       └── proto/            # Protobuf 定义
├── cli/                      # CLI Demo
│   └── src/commands/         # 命令实现
└── web/                      # Web Demo
    └── src/
        ├── components/       # React 组件
        ├── context/          # 状态管理
        └── utils/            # 工具函数
```

---

## 10. 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 语言 | TypeScript | 5.x |
| 运行时 | Node.js | 18+ |
| Waku SDK | @waku/sdk | 0.0.36 |
| 加密库 | @noble/secp256k1, @noble/hashes | 2.x, 1.x |
| 测试 | Vitest | 1.x |
| Web 框架 | React + Vite | 18.x, 5.x |
| 包管理 | pnpm | 9.x |
