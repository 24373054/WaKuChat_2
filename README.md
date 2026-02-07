# WakuChat

基于 [Waku](https://waku.org/) 去中心化协议的端到端加密聊天应用。

## 特性

- 🔐 端到端加密（AES-256-GCM + ECDSA 签名）
- 💬 支持单聊和群聊
- 🌐 去中心化，无需服务器
- 📱 Web 客户端
- 🔄 消息撤回
- 📜 历史消息查询

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

## 网络模式

| 模式 | URL | 说明 |
|------|-----|------|
| 公共网络 | `localhost:5173` | 默认，连接 Waku 公共网络 |
| 本地网络 | `localhost:5173?local=true` | 连接本地 @waku/run 节点 |
| Mock | `localhost:5173?mock=true` | 本地开发测试 |

## 本地 Waku 网络（可选）

```bash
# 启动
npx @waku/run start

# 停止
npx @waku/run stop
```

## SDK 使用示例

```typescript
import { ChatClient, Identity } from '@waku-chat/sdk';

// 初始化
const client = new ChatClient();
await client.init({ lightMode: true });

// 创建身份
const identity = Identity.create();
await client.setIdentity(identity);

// 创建群聊
const group = await client.createGroupConversation('My Group');

// 发送消息
await client.sendMessage(group.id, 'Hello!');

// 监听消息
await client.subscribe(group.id, (msg) => {
  console.log(`${msg.senderId}: ${msg.content}`);
});

// 撤回消息
await client.revokeMessage(group.id, messageId);

// 清理
await client.destroy();
```

## 项目结构

```
packages/
├── sdk/    # 核心 SDK（加密、消息、Waku 适配）
├── cli/    # 命令行客户端
└── web/    # Web 客户端（React + Vite）
```

## 技术栈

- [Waku SDK](https://docs.waku.org/) - 去中心化通信协议
- TypeScript
- React + Vite
- IndexedDB（本地存储）

## 文档

- [设计文档](docs/design.md)

## License

MIT
