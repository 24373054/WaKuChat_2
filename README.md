# WakuChat

基于 [Waku](https://waku.org/) 去中心化 P2P 协议的端到端加密聊天 SDK。

## 功能特性

- 🔐 端到端加密（AES-256-GCM + ECDSA 签名）
- 💬 单聊 (1:1) 和群聊 (N:N)
- 🔄 消息撤回（tombstone 控制消息）
- 🗑️ 本地删除
- 📜 历史消息（Store 协议）
- 🌐 去中心化，无需服务器
- 📱 Web 客户端 + CLI 工具

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 启动 Web 客户端
pnpm web
```

访问 http://localhost:5173

### 一键启动（Windows）

```bash
start.bat
```

### 一键启动（Linux/macOS）

```bash
./start.sh
```

## 网络模式

| 模式 | URL | 说明 |
|------|-----|------|
| 公共网络 | `localhost:5173` | 默认，连接 Waku 公共网络 |
| 本地网络 | `localhost:5173?local=true` | 连接本地 @waku/run 节点 |
| Mock | `localhost:5173?mock=true` | 本地开发测试（标签页间同步） |

## 本地 Waku 网络（可选）

```bash
# 启动本地节点
npx @waku/run start

# 停止
npx @waku/run stop
```

## SDK 使用示例

```typescript
import { ChatClient, Identity } from '@waku-chat/sdk';

// 初始化客户端
const client = new ChatClient();
await client.init({ lightMode: true });

// 创建身份
const identity = Identity.create();
await client.setIdentity(identity);

// 创建单聊
const dm = await client.createDirectConversation(peerUserId, peerPublicKey);

// 创建群聊
const group = await client.createGroupConversation('My Group');

// 发送消息
const messageId = await client.sendMessage(group.id, 'Hello!');

// 订阅消息
await client.subscribe(group.id, (msg) => {
  console.log(`${msg.senderId}: ${msg.content}`);
});

// 拉取历史
const history = await client.fetchHistory(group.id, { limit: 50 });

// 撤回消息
await client.revokeMessage(group.id, messageId);

// 本地删除
await client.deleteLocalMessage(group.id, messageId);

// 清理
await client.destroy();
```

## 演示场景

### 2 人单聊

1. 打开两个浏览器窗口
2. 各自创建身份，记录 User ID 和 Public Key
3. 互相创建 Direct Message，输入对方的 User ID 和 Public Key
4. 发送消息，双方都能收到

### 3 人群聊

1. 用户 A 创建群组
2. 用户 A 点击群组信息，生成邀请（需要输入 B 的 User ID 和 Public Key）
3. 用户 B 使用邀请数据加入群组
4. 重复步骤 2-3 邀请用户 C
5. 三人可以互相发送消息

### 消息撤回

1. 用户 A 发送一条消息
2. 用户 A 点击消息旁的撤回按钮
3. 用户 B 和 C 看到该消息显示为"已撤回"

## 项目结构

```
packages/
├── sdk/    # 核心 SDK（加密、消息、Waku 适配）
├── cli/    # 命令行客户端
└── web/    # Web 客户端（React + Vite）
```

## 测试

```bash
pnpm test
```

## 文档

- [设计文档](docs/design.md) - 协议设计、Topic 规划、安全方案、撤回机制

## 技术栈

- [Waku SDK](https://docs.waku.org/) - 去中心化通信协议
- TypeScript
- React + Vite
- @noble/secp256k1 - 加密库
- IndexedDB - 本地存储

## License

MIT
