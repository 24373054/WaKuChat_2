# Waku 加密聊天 SDK 实现任务

## 任务列表

- [x] 1. 项目初始化与基础架构
  - [x] 1.1 创建 monorepo 结构（pnpm workspace），包含 sdk、cli、web 三个包
  - [x] 1.2 配置 TypeScript、ESLint、Prettier
  - [x] 1.3 安装核心依赖：@waku/sdk、@noble/secp256k1、@noble/hashes、protobufjs
  - [x] 1.4 创建 Protobuf 消息定义文件并生成 TypeScript 类型

- [x] 2. 加密模块实现
  - [x] 2.1 实现 AES-256-GCM 加密/解密（encrypt/decrypt）
  - [x] 2.2 实现 secp256k1 密钥对生成与管理
  - [x] 2.3 实现 ECDSA 签名与验签
  - [x] 2.4 实现 ECDH 密钥交换与 HKDF 密钥派生
  - [x] 2.5 实现 ECIES 加密（用于密钥分发）
  - [x] 2.6 [PBT] 属性测试：加密解密一致性、签名验证、ECDH 对称性

- [x] 3. 身份模块实现
  - [x] 3.1 实现 Identity 类：创建、导出、导入身份
  - [x] 3.2 实现 userId 派生（基于公钥哈希）
  - [x] 3.3 实现身份持久化存储（加密存储私钥）

- [x] 4. Waku 适配层实现
  - [x] 4.1 实现 WakuAdapter 接口定义
  - [x] 4.2 实现 Relay 模式适配器（RelayWakuAdapter）
  - [x] 4.3 实现 Light 模式适配器（LightWakuAdapter：LightPush + Filter）
  - [x] 4.4 实现 Store 协议集成（历史消息查询）
  - [x] 4.5 实现 content topic 生成工具函数

- [x] 5. 消息处理模块实现
  - [x] 5.1 实现消息 ID 生成（SHA256(timestamp + senderId + random)）
  - [x] 5.2 实现消息序列化/反序列化（Protobuf）
  - [x] 5.3 实现消息加密封装（EncryptedEnvelope）
  - [x] 5.4 实现消息签名与验签流程
  - [x] 5.5 实现 DedupeCache 消息去重
  - [x] 5.6 实现 MessageSender 重试机制（指数退避，最多3次）

- [x] 6. 会话管理模块实现
  - [x] 6.1 实现单聊会话创建（conversationId 由双方 userId 派生）
  - [x] 6.2 实现单聊密钥派生（ECDH + HKDF）
  - [x] 6.3 实现群聊会话创建（生成群组密钥）
  - [x] 6.4 实现群聊加入/离开逻辑
  - [x] 6.5 实现群组密钥分发（ECIES 加密）
  - [x] 6.6 实现群组管理员权限管理

- [x] 7. 撤回与删除功能实现
  - [x] 7.1 实现本地删除（仅删除本地存储）
  - [x] 7.2 实现撤回消息发送（tombstone 控制消息）
  - [x] 7.3 实现撤回消息接收与处理
  - [x] 7.4 实现撤回权限验证（原发送者或群管理员）
  - [x] 7.5 [PBT] 属性测试：撤回权限验证正确性

- [x] 8. ChatClient 主类实现
  - [x] 8.1 实现 init/destroy 生命周期管理
  - [x] 8.2 实现 sendMessage 方法（加密、签名、发送）
  - [x] 8.3 实现 subscribe 方法（订阅、解密、验签、回调）
  - [x] 8.4 实现 fetchHistory 方法（Store 查询、解密、合并撤回状态）
  - [x] 8.5 整合所有模块，完成 SDK 导出

- [x] 9. 存储模块实现
  - [x] 9.1 实现 Storage 接口定义
  - [x] 9.2 实现 Node.js 环境存储（LevelDB）
  - [x] 9.3 实现浏览器环境存储（IndexedDB）

- [x] 10. CLI Demo 实现
  - [x] 10.1 实现 CLI 框架（Commander.js + Inquirer.js）
  - [x] 10.2 实现身份管理命令（create-identity、load-identity）
  - [x] 10.3 实现会话命令（create-dm、create-group、join-group）
  - [x] 10.4 实现消息命令（send、history、revoke、delete）
  - [x] 10.5 实现交互式聊天模式

- [x] 11. Web Demo 实现
  - [x] 11.1 创建 React + Vite 项目结构
  - [x] 11.2 实现身份创建/加载界面
  - [x] 11.3 实现会话列表与创建界面
  - [x] 11.4 实现聊天界面（消息显示、发送、撤回状态）
  - [x] 11.5 实现群组管理界面

- [x] 12. 本地测试环境
  - [x] 12.1 创建 Docker Compose 配置（3个 nwaku 节点）
  - [x] 12.2 创建一键启动脚本（start-local-network）
  - [x] 12.3 创建演示脚本（2用户单聊 + 3用户群聊 + 撤回演示）

- [x] 13. 自动化测试
  - [x] 13.1 单元测试：加密模块测试
  - [x] 13.2 单元测试：身份模块测试
  - [x] 13.3 集成测试：单聊互发测试
  - [x] 13.4 集成测试：群聊广播测试
  - [x] 13.5 集成测试：撤回后各端一致显示测试

- [x] 14. 文档与交付
  - [x] 14.1 编写 README（启动、运行、演示步骤）
  - [x] 14.2 完善 docs/design.md（补充实现细节）
  - [x] 14.3 录制演示视频（2人单聊、3人群聊、撤回删除）
  - [x] 14.4 编写复盘清单（Waku topic、消息格式、撤回机制说明）
