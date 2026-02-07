# Waku 加密聊天 SDK 设计文档

本文档详细说明 Waku 加密聊天 SDK 的架构设计和实现细节。

## 1. 系统架构

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
│  │  - RelayAdapter / LightAdapter / MockAdapter         │   │
│  │  - Relay / LightPush / Filter / Store                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    Waku 网络层                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │  nwaku   │  │  nwaku   │  │  nwaku   │                   │
│  │  node 1  │  │  node 2  │  │  node 3  │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## 2. Waku 协议关键概念

### 2.1 pubsub topic vs content topic

**pubsub topic（路由层）**
- 定义消息在 P2P 网络中的传播范围
- 所有订阅同一 pubsub topic 的节点会收到该 topic 下的所有消息
- 本项目使用统一的 pubsub topic：`/waku/2/encrypted-chat/proto`

**content topic（应用层）**
- 用于在 pubsub topic 内部进行消息过滤和分类
- 客户端可以只订阅感兴趣的 content topic
- 格式：`/encrypted-chat/1/{conversationType}/{conversationId}/proto`

**实现代码** (`packages/sdk/src/waku/topics.ts`):
```typescript
export const PUBSUB_TOPIC = '/waku/2/encrypted-chat/proto';
export const CONTENT_TOPIC_PREFIX = '/encrypted-chat/1';

export function generateContentTopic(type: 'dm' | 'group' | 'system', id: string): string {
  return `${CONTENT_TOPIC_PREFIX}/${type}/${id}/proto`;
}
```

### 2.2 Relay vs LightPush/Filter

**Relay 模式（全节点）**
- 节点参与消息路由，帮助转发其他节点的消息
- 优点：去中心化程度高，不依赖特定服务节点
- 缺点：资源消耗较大
- 适用场景：桌面应用、服务器端

**LightPush + Filter 模式（轻节点）**
- LightPush：将消息推送给服务节点
- Filter：向服务节点订阅特定 content topic
- 优点：资源消耗低
- 缺点：依赖服务节点
- 适用场景：移动应用、Web 应用

**实现代码** (`packages/sdk/src/waku/base-adapter.ts`):
```typescript
export function createWakuAdapter(config: WakuAdapterConfig): WakuAdapter {
  if (config.mockMode) {
    return new MockWakuAdapter();
  }
  if (config.lightMode) {
    return new LightWakuAdapter(config);
  }
  return new RelayWakuAdapter(config);
}
```

### 2.3 消息唯一标识

使用自定义方案生成 messageId：
```
messageId = SHA256(timestamp + senderId + randomBytes(16))
```

**实现代码** (`packages/sdk/src/message/message-id.ts`):
```typescript
export function generateMessageId(timestamp: number, senderId: string): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  
  const data = `${timestamp}:${senderId}:${bytesToHex(random)}`;
  const hash = sha256(new TextEncoder().encode(data));
  
  return bytesToHex(hash.slice(0, 16));
}
```

## 3. 消息格式定义（Protobuf）

**消息定义** (`packages/sdk/src/proto/messages.proto`):
```protobuf
syntax = "proto3";
package encrypted_chat;

enum MessageType {
  TEXT = 0;
  REVOKE = 1;
  KEY_EXCHANGE = 2;
  GROUP_INVITE = 3;
  GROUP_JOIN = 4;
  GROUP_LEAVE = 5;
  GROUP_KEY_UPDATE = 6;
}

enum ConversationType {
  DIRECT = 0;
  GROUP = 1;
}

message ChatMessage {
  string message_id = 1;
  string sender_id = 2;
  string conversation_id = 3;
  ConversationType conv_type = 4;
  MessageType type = 5;
  uint64 timestamp = 6;
  bytes payload = 7;
  uint32 version = 8;
}

message EncryptedEnvelope {
  bytes encrypted_payload = 1;
  bytes nonce = 2;
  bytes signature = 3;
  string sender_id = 4;
  uint64 timestamp = 5;
  uint32 version = 6;
}

message TextPayload {
  string content = 1;
}

message RevokePayload {
  string target_message_id = 1;
  string reason = 2;
}
```

## 4. 安全方案实现

### 4.1 AES-256-GCM 加密

**实现代码** (`packages/sdk/src/crypto/aes.ts`):
```typescript
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 128;

export async function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce?: Uint8Array
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const iv = nonce ?? generateNonce();
  const cryptoKey = await importKey(key);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    cryptoKey,
    plaintext
  );

  return { ciphertext: new Uint8Array(ciphertext), nonce: iv };
}

export async function decrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await importKey(key);
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: nonce, tagLength: TAG_LENGTH },
    cryptoKey,
    ciphertext
  );
  return new Uint8Array(plaintext);
}
```

### 4.2 ECDH 密钥交换

**实现代码** (`packages/sdk/src/crypto/ecdh.ts`):
```typescript
export function computeSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  const sharedPoint = secp256k1.getSharedSecret(privateKey, publicKey, true);
  return sharedPoint.slice(1); // x-coordinate
}

export function deriveSessionKey(
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array,
  conversationId: string
): Uint8Array {
  const sharedSecret = computeSharedSecret(myPrivateKey, peerPublicKey);
  return hkdf(sha256, sharedSecret, conversationId, 'encrypted-chat-session-key', 32);
}

export function deriveConversationId(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  const combined = sorted.join(':');
  const hash = sha256(new TextEncoder().encode(combined));
  return bytesToHex(hash.slice(0, 16));
}
```

### 4.3 ECDSA 签名

**实现代码** (`packages/sdk/src/crypto/ecdsa.ts`):
```typescript
export async function sign(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  const msgHash = sha256(message);
  const signature = await secp256k1.signAsync(msgHash, privateKey);
  return signature.toCompactRawBytes();
}

export function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  const msgHash = sha256(message);
  const sig = secp256k1.Signature.fromCompact(signature);
  return secp256k1.verify(sig, msgHash, publicKey);
}
```

### 4.4 ECIES 加密（群组密钥分发）

**实现代码** (`packages/sdk/src/crypto/ecies.ts`):
```typescript
export async function eciesEncrypt(
  publicKey: Uint8Array,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  // Generate ephemeral key pair
  const ephemeralPrivateKey = secp256k1.utils.randomPrivateKey();
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralPrivateKey, true);
  
  // Derive shared secret
  const sharedSecret = computeSharedSecret(ephemeralPrivateKey, publicKey);
  const encryptionKey = deriveKey(sharedSecret, 'ecies-encryption');
  
  // Encrypt with AES-GCM
  const { ciphertext, nonce } = await encrypt(plaintext, encryptionKey);
  
  // Return: ephemeralPublicKey || nonce || ciphertext
  return concatBytes(ephemeralPublicKey, nonce, ciphertext);
}

export async function eciesDecrypt(
  privateKey: Uint8Array,
  encrypted: Uint8Array
): Promise<Uint8Array> {
  // Parse components
  const ephemeralPublicKey = encrypted.slice(0, 33);
  const nonce = encrypted.slice(33, 45);
  const ciphertext = encrypted.slice(45);
  
  // Derive shared secret
  const sharedSecret = computeSharedSecret(privateKey, ephemeralPublicKey);
  const encryptionKey = deriveKey(sharedSecret, 'ecies-encryption');
  
  // Decrypt
  return decrypt(ciphertext, encryptionKey, nonce);
}
```

## 5. 撤回机制实现

### 5.1 撤回消息格式

```typescript
interface RevokePayload {
  targetMessageId: string;  // 被撤回的消息 ID
  reason?: string;          // 撤回原因（可选）
}
```

### 5.2 撤回权限验证

**实现代码** (`packages/sdk/src/message/revoke-permission.ts`):
```typescript
export function canRevoke(
  revokerId: string,
  originalSenderId: string,
  conversationType: 'direct' | 'group',
  admins?: string[]
): boolean {
  // 原发送者可以撤回
  if (revokerId === originalSenderId) {
    return true;
  }
  
  // 群聊中管理员可以撤回
  if (conversationType === 'group' && admins?.includes(revokerId)) {
    return true;
  }
  
  return false;
}
```

### 5.3 撤回处理流程

**实现代码** (`packages/sdk/src/message/revoke-handler.ts`):
```typescript
export async function handleRevokeMessage(
  revokePayload: RevokePayload,
  senderId: string,
  conversation: Conversation,
  storage: MessageStorage
): Promise<boolean> {
  // 获取原消息
  const originalMessage = await storage.loadMessage(
    conversation.id,
    revokePayload.targetMessageId
  );
  
  if (!originalMessage) {
    return false;
  }
  
  // 验证权限
  if (!conversation.canRevoke(senderId, originalMessage.senderId)) {
    return false;
  }
  
  // 标记为已撤回
  await storage.markAsRevoked(
    revokePayload.targetMessageId,
    senderId,
    revokePayload.reason
  );
  
  return true;
}
```

### 5.4 撤回的边界说明

**去中心化网络的现实约束**：
1. 消息一旦发送到网络，会被多个节点接收和存储
2. 无法强制所有节点删除已存储的消息
3. 离线节点在上线后仍可能从 Store 节点获取到原消息
4. 恶意节点可能故意保留和传播已撤回的消息

**本项目的撤回实现方案**：
1. 发送撤回控制消息（tombstone），包含被撤回的 messageId
2. 控制消息包含发送者签名，用于权限验证
3. 客户端收到撤回消息后，将对应消息标记为"已撤回"
4. UI 层显示"此消息已被撤回"而非原内容
5. 从 Store 拉取历史时，同时拉取撤回消息，合并处理

## 6. 消息去重实现

**实现代码** (`packages/sdk/src/message/dedupe-cache.ts`):
```typescript
export class DedupeCache {
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

  checkAndAdd(messageId: string): boolean {
    if (this.isDuplicate(messageId)) {
      return true;
    }
    this.add(messageId);
    return false;
  }

  add(messageId: string): void {
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

## 7. 消息重发机制

**实现代码** (`packages/sdk/src/message/sender.ts`):
```typescript
export class MessageSender {
  private maxRetries = 3;
  private baseDelay = 1000;

  async send(
    adapter: WakuAdapter,
    contentTopic: string,
    payload: Uint8Array
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await adapter.publish(contentTopic, payload);
        return;
      } catch (error) {
        lastError = error as Error;
        const delay = this.baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    throw new Error(`Failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## 8. 存储模块实现

### 8.1 存储接口

```typescript
export interface StorageBackend {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
```

### 8.2 LevelDB 实现（Node.js）

**实现代码** (`packages/sdk/src/storage/leveldb-backend.ts`):
```typescript
export class LevelDBBackend implements StorageBackend {
  private db: Level<string, Uint8Array>;

  constructor(path: string) {
    this.db = new Level(path, { valueEncoding: 'view' });
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await this.db.get(key);
    } catch (error) {
      if ((error as any).code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    await this.db.put(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.db.del(key);
  }
}
```

### 8.3 IndexedDB 实现（浏览器）

**实现代码** (`packages/sdk/src/storage/indexeddb-backend.ts`):
```typescript
export class IndexedDBBackend implements StorageBackend {
  private dbName: string;
  private storeName = 'kv-store';
  private db: IDBDatabase | null = null;

  constructor(dbName: string = 'waku-chat') {
    this.dbName = dbName;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
```

## 9. 正确性属性（Correctness Properties）

### CP1: 加密一致性
对于任意明文 M 和密钥 K，`decrypt(encrypt(M, K), K) = M`

### CP2: 签名不可伪造
对于任意消息 M，只有持有私钥的用户才能生成有效签名

### CP3: ECDH 对称性
对于任意两个密钥对 (a, A) 和 (b, B)，`ECDH(a, B) = ECDH(b, A)`

### CP4: 消息去重
相同 messageId 的消息只会被处理一次

### CP5: 撤回权限
只有原发送者或群管理员的撤回请求才会被接受

### CP6: 消息完整性
任何对消息内容的篡改都会导致签名验证失败

## 10. 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 语言 | TypeScript | 5.x |
| 运行时 | Node.js | 18+ |
| Waku SDK | @waku/sdk | 0.0.36 |
| 加密库 | @noble/secp256k1 | 2.1.0 |
| 哈希库 | @noble/hashes | 1.4.0 |
| 序列化 | protobufjs | 7.2.6 |
| 测试 | Vitest | 1.4.0 |
| PBT | fast-check | 3.17.0 |
| CLI | Commander.js | 12.0.0 |
| Web | React | 18.2.0 |
| 构建 | Vite | 5.2.0 |
| 包管理 | pnpm | 9.0.0 |

## 11. 项目结构

```
waku-encrypted-chat/
├── packages/
│   ├── sdk/                    # 核心 SDK 库
│   │   ├── src/
│   │   │   ├── client/         # ChatClient 主类
│   │   │   ├── identity/       # 身份管理
│   │   │   ├── conversation/   # 会话管理
│   │   │   ├── message/        # 消息处理
│   │   │   ├── crypto/         # 加密模块
│   │   │   ├── waku/           # Waku 适配层
│   │   │   ├── storage/        # 存储模块
│   │   │   └── proto/          # Protobuf 定义
│   │   └── package.json
│   ├── cli/                    # CLI Demo
│   │   └── src/commands/       # 命令实现
│   └── web/                    # Web Demo
│       └── src/components/     # React 组件
├── docker/                     # Docker 配置
├── scripts/                    # 启动脚本
└── docs/                       # 文档
```
