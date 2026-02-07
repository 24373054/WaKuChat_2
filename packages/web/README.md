# Waku Encrypted Chat - Web Demo

## ✅ 状态：已修复并可运行

Web Demo 已经完全修复并可以正常运行！所有代码已实现，包括：

- ✅ 身份创建/加载界面
- ✅ 会话列表与创建界面  
- ✅ 聊天界面（消息显示、发送、撤回状态）
- ✅ 群组管理界面
- ✅ 完整的 UI/UX 设计
- ✅ Waku SDK 浏览器兼容性问题已解决

## 🚀 快速启动

### 启动开发服务器

在项目根目录执行：

```bash
pnpm --filter @waku-chat/web dev
```

或者进入 web 目录后执行：

```bash
cd packages/web
pnpm dev
```

### 访问应用

浏览器访问：**http://localhost:5173**

## 📝 使用说明

### 首次使用

1. **创建身份**：选择 "Create New Identity" 创建新身份
2. **设置密码**：输入至少 6 位密码来保护你的身份
3. **保存信息**：创建后会显示你的 User ID 和 Public Key
4. **分享信息**：需要将 User ID 和 Public Key 分享给其他人才能聊天

### 测试聊天功能

要测试完整的聊天功能，你需要：

1. 在两个不同的浏览器窗口（或无痕模式）中各创建一个身份
2. 互相交换 User ID 和 Public Key
3. 在一个窗口中点击 "💬" 创建 Direct Message
4. 输入对方的 User ID 和 Public Key
5. 开始聊天！

### 群聊功能

1. 点击 "👥" 创建群组
2. 输入群组名称
3. 点击 "ℹ️ Info" 查看群组信息
4. 复制 "Invite Data" 分享给其他人
5. 其他人点击 "➕" 并粘贴邀请数据即可加入

## 🔧 技术修复说明

### 已解决的问题

1. **Waku SDK 版本升级**：从 v0.0.27 升级到 v0.0.36
2. **API 适配**：更新了 Light Adapter 和 Relay Adapter 以适配新版 SDK API
3. **Vite 配置**：添加了 Node.js polyfills 支持（Buffer, process, stream 等）
4. **依赖解析**：修复了 `@multiformats/multiaddr` 的导入问题
5. **类型修复**：修复了所有 TypeScript 类型错误
6. **Debug 模块修复**：创建了自定义 Vite 插件来处理 `debug` 模块的 CommonJS/ESM 兼容性问题

### 关键配置

**Vite 配置** (`vite.config.ts`):
- 使用 `vite-plugin-node-polyfills` 提供 Node.js 全局变量
- 配置 alias 解决 multiaddr 导入问题
- 排除 `@waku/sdk` 和 `debug` 从预构建，让 Vite 在运行时处理
- 使用自定义插件 `debugFixPlugin` 解决 debug 模块的 ESM/CommonJS 兼容性问题

**Debug Fix Plugin** (`vite-plugin-debug-fix.ts`):
- 拦截所有 `debug` 模块的导入
- 提供一个轻量级的 shim 替代，避免 CommonJS/ESM 冲突
- 在浏览器环境中禁用 debug 日志功能

**SDK 适配器**:
- 使用 `createLightNode` 和 `waitForRemotePeer`
- 使用 `defaultBootstrap: true` 连接官方 WSS 节点
- 正确处理 filter.subscribe 的返回值

## 📁 项目结构

```
packages/web/
├── src/
│   ├── components/
│   │   ├── IdentityView.tsx      # 身份管理界面
│   │   ├── ConversationsView.tsx # 会话列表界面
│   │   └── ChatView.tsx          # 聊天界面
│   ├── context/
│   │   └── AppContext.tsx        # 全局状态管理
│   ├── utils/
│   │   └── storage.ts            # 本地存储工具
│   ├── App.tsx                   # 主应用组件
│   └── main.tsx                  # 入口文件
├── index.html
├── vite.config.ts                # Vite 配置（包含 polyfills）
└── package.json
```

## 🎯 功能说明

### 身份管理
- 创建新身份（生成 secp256k1 密钥对）
- 导入已有身份（从加密 JSON）
- 加载保存的身份（从 localStorage）
- 导出身份（加密 JSON 格式）

### 会话管理
- 创建单聊（需要对方 User ID 和 Public Key）
- 创建群聊（生成群组 ID 和密钥）
- 加入群聊（通过邀请数据）
- 删除会话

### 消息功能
- 发送文本消息（AES-256-GCM 加密）
- 实时接收消息（通过 Waku Filter 协议）
- 撤回消息（发送 tombstone 控制消息）
- 查看历史消息（通过 Waku Store 协议）
- 消息验证状态显示（ECDSA 签名验证）

### 群组功能
- 查看群组信息
- 成员列表（显示管理员标识）
- 生成邀请数据（JSON 格式）
- 复制邀请链接到剪贴板

## 🔐 安全特性

- **端到端加密**：所有消息使用 AES-256-GCM 加密
- **消息签名**：使用 ECDSA 签名确保消息完整性
- **密钥派生**：单聊使用 ECDH + HKDF，群聊使用共享密钥
- **本地加密存储**：身份密钥加密存储在 localStorage

## 🌐 网络协议

- **Light Push**：发送消息到 Waku 网络
- **Filter**：订阅和接收特定 content topic 的消息
- **Store**：查询历史消息
- **Bootstrap**：自动连接到官方 WSS 引导节点

## 🛠️ 技术栈

- React 18
- TypeScript
- Vite 5
- @waku/sdk v0.0.36
- @waku-chat/sdk (workspace)
- vite-plugin-node-polyfills
- CSS Modules

## 🐛 故障排除

### 白屏或模块导入错误

如果遇到类似 "does not provide an export named 'default'" 的错误：

1. **清除 Vite 缓存**：
   ```bash
   rm -rf packages/web/node_modules/.vite
   # 或在 Windows 上
   rmdir /s /q packages\web\node_modules\.vite
   ```

2. **重启开发服务器**：
   ```bash
   pnpm --filter @waku-chat/web dev
   ```

3. **清除浏览器缓存**：按 Ctrl+Shift+R (Windows) 或 Cmd+Shift+R (Mac) 强制刷新

### 如果遇到连接问题

1. **检查网络**：确保可以访问 Waku 的 WSS 节点
2. **查看控制台**：打开浏览器开发者工具查看错误信息
3. **清除缓存**：清除 localStorage 和浏览器缓存后重试
4. **检查防火墙**：确保防火墙没有阻止 WebSocket 连接

### 如果消息收不到

1. **确认 Content Topic**：发送方和接收方的 content topic 必须完全一致
2. **等待连接**：首次连接可能需要几秒钟来发现对等节点
3. **检查订阅**：确保在发送消息前已经订阅了会话

## 📚 相关文档

- [Waku 官方文档](https://docs.waku.org/)
- [设计文档](../../.kiro/specs/waku-encrypted-chat/design.md)
- [需求文档](../../.kiro/specs/waku-encrypted-chat/requirements.md)

## 🎉 成功！

Web Demo 现在完全可用！享受去中心化的加密聊天体验吧！
