# Waku 加密聊天 SDK 复盘清单

本文档总结项目实现过程中的关键技术决策、遇到的问题和解决方案。

## 1. Waku Topic 设计

### 1.1 pubsub topic vs content topic

| 概念 | 作用 | 本项目使用 |
|------|------|-----------|
| pubsub topic | 网络层路由，决定消息传播范围 | `/waku/2/encrypted-chat/proto` |
| content topic | 应用层过滤，用于消息分类 | `/encrypted-chat/1/{type}/{id}/proto` |

### 1.2 设计决策

**为什么使用单一 pubsub topic？**
- 简化网络拓扑配置
- 确保所有节点都能收到消息
- 避免跨 topic 消息路由问题

**content topic 格式设计**
```
/encrypted-chat/1/{type}/{id}/proto
```
- `1`: 协议版本号，便于未来升级
- `type`: `dm`（单聊）、`group`（群聊）、`system`（系统消息）
- `id`: 会话唯一标识
- `proto`: 表示使用 Protobuf 编码

### 1.3 遇到的问题

**问题 1: content topic 长度限制**
- Waku 对 content topic 有长度限制
- 解决方案：使用哈希截断的会话 ID（32 字符）

**问题 2: topic 订阅延迟**
- 新订阅的 topic 可能需要几秒才能收到消息
- 解决方案：在 UI 层添加"连接中"状态提示

---

## 2. 消息格式设计

### 2.1 消息结构

```
┌─────────────────────────────────────────┐
│           EncryptedEnvelope             │
├─────────────────────────────────────────┤
│  encrypted_payload (AES-256-GCM)        │
│  nonce (12 bytes)                       │
│  signature (ECDSA)                      │
│  sender_id (明文)                        │
│  timestamp (明文)                        │
│  version                                │
└─────────────────────────────────────────┘
                    │
                    ▼ 解密后
┌─────────────────────────────────────────┐
│             ChatMessage                 │
├─────────────────────────────────────────┤
│  message_id                             │
│  sender_id                              │
│  conversation_id                        │
│  conv_type (DIRECT/GROUP)               │
│  type (TEXT/REVOKE/...)                 │
│  timestamp                              │
│  payload (根据 type 解析)                │
│  version                                │
└─────────────────────────────────────────┘
```

### 2.2 设计决策

**为什么 sender_id 和 timestamp 在信封层是明文？**
- 允许在解密前进行基本过滤和排序
- 用于查找发送者公钥进行签名验证
- 不泄露敏感信息（用户 ID 是公钥派生的哈希）

**为什么使用 Protobuf？**
- 紧凑的二进制格式，减少网络传输
- 强类型定义，便于跨语言实现
- 支持向后兼容的版本演进

### 2.3 遇到的问题

**问题 1: Protobuf 缓冲区视图问题**
- protobufjs 返回的 Uint8Array 可能是大缓冲区的视图
- 直接传给 Web Crypto API 会导致错误
- 解决方案：在加密前复制数据到新的 ArrayBuffer

```typescript
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer;
  }
  return data.slice().buffer;
}
```

**问题 2: 消息 ID 碰撞**
- 初始设计只用 timestamp + senderId
- 高并发时可能碰撞
- 解决方案：添加 16 字节随机数

---

## 3. 撤回机制设计

### 3.1 撤回流程

```
发送者/管理员                    其他客户端
     │                              │
     │  1. 创建撤回消息              │
     │     (tombstone)              │
     │                              │
     │  2. 签名撤回消息              │
     │                              │
     │  3. 发送到 Waku 网络  ───────►│
     │                              │
     │                              │  4. 验证签名
     │                              │
     │                              │  5. 验证权限
     │                              │
     │                              │  6. 标记消息为"已撤回"
     │                              │
     │                              │  7. UI 显示"此消息已被撤回"
```

### 3.2 权限规则

| 场景 | 允许撤回 |
|------|---------|
| 单聊 - 原发送者 | ✅ |
| 单聊 - 对方 | ❌ |
| 群聊 - 原发送者 | ✅ |
| 群聊 - 管理员 | ✅ |
| 群聊 - 普通成员撤回他人消息 | ❌ |

### 3.3 设计决策

**为什么使用 tombstone 而不是删除？**
- 去中心化网络无法强制删除已传播的消息
- tombstone 是"逻辑删除"的标准做法
- 允许客户端自行决定如何处理撤回

**为什么撤回消息也需要签名？**
- 防止恶意用户伪造撤回请求
- 确保只有授权用户可以撤回
- 提供不可否认性

### 3.4 遇到的问题

**问题 1: 撤回消息和原消息的顺序**
- 从 Store 拉取历史时，撤回消息可能在原消息之前到达
- 解决方案：两遍处理
  1. 第一遍：收集所有撤回消息
  2. 第二遍：处理普通消息，合并撤回状态

**问题 2: 离线期间的撤回**
- 用户离线时可能错过撤回消息
- 解决方案：每次拉取历史时重新处理撤回状态

### 3.5 边界说明

**撤回的局限性**
1. 已接收但未处理撤回的客户端仍可看到原消息
2. 恶意客户端可以选择忽略撤回消息
3. 网络层和存储层可能仍保留原消息数据
4. 截图或复制的内容无法撤回

**建议的 UI 提示**
```
⚠️ 撤回是"尽力而为"的操作。
已发送的消息可能已被其他人看到或保存。
```

---

## 4. 加密方案总结

### 4.1 使用的算法

| 用途 | 算法 | 参数 |
|------|------|------|
| 消息加密 | AES-256-GCM | 256-bit key, 96-bit nonce |
| 密钥交换 | ECDH | secp256k1 曲线 |
| 密钥派生 | HKDF-SHA256 | 32 字节输出 |
| 签名 | ECDSA | secp256k1 曲线 |
| 群组密钥分发 | ECIES | secp256k1 + AES-256-GCM |

### 4.2 密钥管理

**单聊密钥派生**
```
sharedSecret = ECDH(myPrivateKey, peerPublicKey)
sessionKey = HKDF(sharedSecret, conversationId, "encrypted-chat-session-key")
```

**群聊密钥分发**
```
groupKey = randomBytes(32)
encryptedKey = ECIES.encrypt(memberPublicKey, groupKey)
```

### 4.3 遇到的问题

**问题 1: Web Crypto API 兼容性**
- 某些浏览器对 AES-GCM 的 nonce 长度有限制
- 解决方案：统一使用 12 字节 nonce（96 bits）

**问题 2: secp256k1 库选择**
- 最初考虑使用 elliptic.js
- 发现 @noble/secp256k1 更现代、更安全
- 迁移到 @noble 系列库

---

## 5. Waku SDK 集成经验

### 5.1 版本演进

| 版本 | 问题 | 解决方案 |
|------|------|---------|
| 0.0.27 | API 不稳定 | 升级到 0.0.36 |
| 0.0.36 | Filter API 变更 | 适配新的订阅返回值 |

### 5.2 浏览器兼容性

**问题：Node.js polyfills**
- Waku SDK 依赖 Node.js 内置模块
- 浏览器环境需要 polyfills

**解决方案：Vite 配置**
```typescript
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'process', 'stream', 'util'],
      globals: { Buffer: true, process: true },
    }),
  ],
});
```

### 5.3 连接稳定性

**问题：连接断开后不自动重连**
- 解决方案：实现连接状态监控和自动重连逻辑

**问题：Bootstrap 节点不可用**
- 解决方案：提供多个备选节点，支持自定义节点配置

---

## 6. 测试策略总结

### 6.1 测试类型

| 类型 | 工具 | 覆盖范围 |
|------|------|---------|
| 单元测试 | Vitest | 加密、身份、消息处理 |
| 属性测试 | fast-check | 加密一致性、ECDH 对称性 |
| 集成测试 | Vitest | 端到端消息流程 |

### 6.2 属性测试示例

```typescript
// 加密解密一致性
fc.assert(
  fc.property(
    fc.uint8Array({ minLength: 1, maxLength: 1000 }),
    fc.uint8Array({ minLength: 32, maxLength: 32 }),
    async (plaintext, key) => {
      const { ciphertext, nonce } = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, key, nonce);
      return arraysEqual(plaintext, decrypted);
    }
  )
);

// ECDH 对称性
fc.assert(
  fc.property(fc.constant(null), () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const aliceShared = computeSharedSecret(alice.privateKey, bob.publicKey);
    const bobShared = computeSharedSecret(bob.privateKey, alice.publicKey);
    return arraysEqual(aliceShared, bobShared);
  })
);
```

---

## 7. 未来改进方向

### 7.1 功能增强
- [ ] 支持文件/图片消息
- [ ] 支持消息已读回执
- [ ] 支持群组密钥轮换
- [ ] 支持多设备同步

### 7.2 性能优化
- [ ] 消息批量处理
- [ ] 本地消息缓存优化
- [ ] 连接池管理

### 7.3 安全增强
- [ ] 前向保密（Forward Secrecy）
- [ ] 密钥备份和恢复
- [ ] 设备验证机制

---

## 8. 参考资料

- [Waku 官方文档](https://docs.waku.org/)
- [Waku SDK GitHub](https://github.com/waku-org/js-waku)
- [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Protobuf.js](https://github.com/protobufjs/protobuf.js)
