# Waku 加密聊天 SDK 演示指南

本文档提供详细的演示步骤，可用于录制演示视频或现场演示。

## 演示概述

演示内容包括：
1. **2人单聊** - Alice 和 Bob 之间的加密通信
2. **3人群聊** - Alice、Bob、Charlie 的群组聊天
3. **消息撤回** - 演示撤回功能和权限控制

## 前置准备

### 1. 启动本地 Waku 网络

```bash
# 启动 3 个 nwaku 节点
./scripts/start-local-network.sh

# 等待所有节点健康
# 预期输出：
# [✓] All nodes are healthy!
# Node Status:
#   nwaku1 - healthy - localhost:8545
#   nwaku2 - healthy - localhost:8546
#   nwaku3 - healthy - localhost:8547
```

### 2. 构建项目

```bash
pnpm install
pnpm build
```

---

## 演示 1: 2人单聊 (Alice ↔ Bob)

### 场景说明
Alice 和 Bob 想要进行私密的一对一聊天。他们需要：
1. 各自创建身份
2. 交换公钥信息
3. 创建单聊会话
4. 发送加密消息

### 步骤

#### 终端 1 - Alice

```bash
# 设置 Alice 的数据目录
export WAKU_CHAT_DATA_DIR=.demo-data/alice

# 创建身份
cd packages/cli
pnpm start identity create
# 输入密码: demo123456
# 记录输出的 User ID 和 Public Key

# 查看身份信息
pnpm start identity show
```

#### 终端 2 - Bob

```bash
# 设置 Bob 的数据目录
export WAKU_CHAT_DATA_DIR=.demo-data/bob

# 创建身份
cd packages/cli
pnpm start identity create
# 输入密码: demo123456
# 记录输出的 User ID 和 Public Key

# 查看身份信息
pnpm start identity show
```

#### 创建单聊会话

**Alice 终端:**
```bash
# 创建与 Bob 的单聊
pnpm start conversation create-dm
# 输入 Bob 的 User ID
# 输入 Bob 的 Public Key
# 记录生成的 Conversation ID
```

**Bob 终端:**
```bash
# 创建与 Alice 的单聊
pnpm start conversation create-dm
# 输入 Alice 的 User ID
# 输入 Alice 的 Public Key
# 会生成相同的 Conversation ID（因为是确定性派生）
```

#### 发送消息

**Alice 终端:**
```bash
# 进入聊天模式
pnpm start chat
# 选择与 Bob 的会话
# 发送消息: "Hello Bob! This is an encrypted message."
```

**Bob 终端:**
```bash
# 进入聊天模式
pnpm start chat
# 选择与 Alice 的会话
# 应该能看到 Alice 的消息
# 回复: "Hi Alice! I received your encrypted message."
```

### 演示要点
- ✅ 消息使用 AES-256-GCM 加密
- ✅ 会话密钥通过 ECDH 派生
- ✅ 每条消息都有 ECDSA 签名
- ✅ 相同的 User ID 组合生成相同的 Conversation ID

---

## 演示 2: 3人群聊 (Alice, Bob, Charlie)

### 场景说明
Alice 创建一个群组，邀请 Bob 和 Charlie 加入。

### 步骤

#### 终端 3 - Charlie

```bash
# 设置 Charlie 的数据目录
export WAKU_CHAT_DATA_DIR=.demo-data/charlie

# 创建身份
cd packages/cli
pnpm start identity create
# 输入密码: demo123456
# 记录输出的 User ID 和 Public Key
```

#### Alice 创建群组

**Alice 终端:**
```bash
# 创建群组
pnpm start conversation create-group
# 输入群组名称: "Demo Group"
# 记录生成的 Group ID

# 生成邀请数据给 Bob
pnpm start conversation invite <group-id>
# 输入 Bob 的 User ID
# 输入 Bob 的 Public Key
# 复制生成的邀请数据

# 生成邀请数据给 Charlie
pnpm start conversation invite <group-id>
# 输入 Charlie 的 User ID
# 输入 Charlie 的 Public Key
# 复制生成的邀请数据
```

#### Bob 和 Charlie 加入群组

**Bob 终端:**
```bash
# 加入群组
pnpm start conversation join-group
# 粘贴 Alice 发送的邀请数据
```

**Charlie 终端:**
```bash
# 加入群组
pnpm start conversation join-group
# 粘贴 Alice 发送的邀请数据
```

#### 群聊消息

**Alice 终端:**
```bash
pnpm start chat
# 选择群组会话
# 发送: "Welcome to the group, everyone!"
```

**Bob 终端:**
```bash
pnpm start chat
# 选择群组会话
# 应该能看到 Alice 的消息
# 发送: "Thanks for the invite, Alice!"
```

**Charlie 终端:**
```bash
pnpm start chat
# 选择群组会话
# 应该能看到 Alice 和 Bob 的消息
# 发送: "Hello everyone! Charlie here."
```

### 演示要点
- ✅ 群组密钥由创建者生成
- ✅ 邀请数据包含 ECIES 加密的群组密钥
- ✅ 所有成员使用相同的群组密钥加密消息
- ✅ 创建者自动成为管理员

---

## 演示 3: 消息撤回

### 场景说明
演示消息撤回功能和权限控制。

### 步骤

#### 3.1 发送者撤回自己的消息

**Bob 终端:**
```bash
# 在群聊中发送一条消息
pnpm start message send <group-id> "This message will be revoked"
# 记录返回的 Message ID

# 撤回消息
pnpm start message revoke <group-id> <message-id>
# 预期: 撤回成功
```

**Alice 和 Charlie 终端:**
```bash
# 查看消息历史
pnpm start message history <group-id>
# 预期: Bob 的消息显示为 "[Message revoked]"
```

#### 3.2 管理员撤回他人消息

**Charlie 终端:**
```bash
# 发送一条消息
pnpm start message send <group-id> "Charlie's message"
# 记录 Message ID
```

**Alice 终端 (管理员):**
```bash
# 作为管理员撤回 Charlie 的消息
pnpm start message revoke <group-id> <charlie-message-id>
# 预期: 撤回成功（因为 Alice 是管理员）
```

#### 3.3 非管理员无法撤回他人消息

**Bob 终端:**
```bash
# 尝试撤回 Alice 的消息
pnpm start message revoke <group-id> <alice-message-id>
# 预期: 错误 - "You do not have permission to revoke this message"
```

### 演示要点
- ✅ 发送者可以撤回自己的消息
- ✅ 群管理员可以撤回任何人的消息
- ✅ 普通成员无法撤回他人的消息
- ✅ 撤回后消息显示为"已撤回"

---

## 演示 4: 本地删除

### 场景说明
演示本地删除功能，仅影响当前设备。

**Alice 终端:**
```bash
# 本地删除一条消息
pnpm start message delete <conversation-id> <message-id>
# 预期: 消息从本地存储删除

# 查看历史
pnpm start message history <conversation-id>
# 预期: 该消息不再显示
```

**Bob 终端:**
```bash
# 查看相同会话的历史
pnpm start message history <conversation-id>
# 预期: 消息仍然存在（因为只是 Alice 本地删除）
```

### 演示要点
- ✅ 本地删除不发送网络消息
- ✅ 仅影响当前设备
- ✅ 其他用户不受影响

---

## Web Demo 演示

### 启动 Web 应用

```bash
pnpm --filter @waku-chat/web dev
# 访问 http://localhost:5173
```

### 演示步骤

1. **创建身份**
   - 点击 "Create New Identity"
   - 输入密码
   - 记录 User ID 和 Public Key

2. **创建单聊**
   - 在另一个浏览器窗口创建第二个身份
   - 点击 "💬" 创建 Direct Message
   - 输入对方的 User ID 和 Public Key

3. **发送消息**
   - 在聊天界面输入消息
   - 点击发送
   - 观察消息加密和签名验证状态

4. **创建群聊**
   - 点击 "👥" 创建群组
   - 输入群组名称
   - 点击 "ℹ️ Info" 获取邀请数据
   - 分享给其他用户

5. **消息撤回**
   - 右键点击自己发送的消息
   - 选择 "Revoke"
   - 观察消息变为 "[Message revoked]"

---

## 清理

```bash
# 停止 Waku 网络
./scripts/start-local-network.sh stop

# 清理演示数据
rm -rf .demo-data
```

---

## 视频录制建议

### 录制工具
- OBS Studio (推荐)
- macOS: QuickTime Player
- Windows: Xbox Game Bar

### 录制设置
- 分辨率: 1920x1080
- 帧率: 30fps
- 格式: MP4

### 录制顺序
1. 环境准备 (30秒)
2. 2人单聊演示 (2分钟)
3. 3人群聊演示 (2分钟)
4. 消息撤回演示 (1分钟)
5. Web Demo 演示 (2分钟)
6. 总结 (30秒)

### 预计总时长
约 8-10 分钟
