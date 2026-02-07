# Waku Encrypted Chat - Scripts

本目录包含用于启动本地测试网络和运行演示的脚本。

## 脚本列表

| 脚本 | 描述 |
|------|------|
| `start-local-network.sh` | Linux/macOS 启动脚本 |
| `start-local-network.bat` | Windows 启动脚本 |
| `demo.sh` | Linux/macOS 演示脚本 |
| `demo.bat` | Windows 演示脚本 |

## 快速开始

### 1. 启动本地 Waku 网络

```bash
# Linux/macOS
./scripts/start-local-network.sh

# Windows
scripts\start-local-network.bat
```

### 2. 运行演示

```bash
# Linux/macOS
./scripts/demo.sh

# Windows
scripts\demo.bat
```

## 网络管理命令

```bash
# 启动网络
./scripts/start-local-network.sh start

# 停止网络
./scripts/start-local-network.sh stop

# 查看状态
./scripts/start-local-network.sh status

# 查看日志
./scripts/start-local-network.sh logs

# 清理（删除所有数据）
./scripts/start-local-network.sh clean
```

## 演示内容

演示脚本展示以下功能：

1. **身份管理** - 创建和管理用户身份
2. **单聊** - Alice 和 Bob 之间的加密通信
3. **群聊** - Alice、Bob、Charlie 三人群组
4. **消息撤回** - 撤回已发送的消息

## 前置要求

- Docker 和 Docker Compose
- Node.js 18+
- pnpm

## 故障排除

### Docker 未运行
```
[X] Docker daemon is not running
```
解决：启动 Docker Desktop 或 Docker 服务

### 节点不健康
```
[!] Some nodes are not healthy
```
解决：查看日志 `./scripts/start-local-network.sh logs`

### CLI 未构建
```
Building CLI package...
```
这是正常的，脚本会自动构建
