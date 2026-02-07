# Waku Local Test Network

本地测试网络配置，包含 3 个 nwaku 节点。

## 节点配置

| 节点 | REST API | libp2p | discv5 |
|------|----------|--------|--------|
| nwaku1 | 8545 | 60000 | 9000 |
| nwaku2 | 8546 | 60001 | 9001 |
| nwaku3 | 8547 | 60002 | 9002 |

## 启用的协议

- Relay - 消息中继
- Filter - 消息过滤（轻节点）
- LightPush - 轻推送（轻节点）
- Store - 历史消息存储

## 使用方法

### 启动网络

```bash
# 从项目根目录
./scripts/start-local-network.sh

# 或直接使用 docker-compose
cd docker
docker-compose up -d
```

### 停止网络

```bash
./scripts/start-local-network.sh stop

# 或
cd docker
docker-compose down
```

### 查看日志

```bash
# 查看所有节点日志
docker-compose logs -f

# 查看特定节点日志
docker-compose logs -f nwaku1
```

### 检查节点状态

```bash
# 检查节点1健康状态
curl http://localhost:8545/health

# 获取节点1信息
curl http://localhost:8545/debug/v1/info
```

## pubsub topic

所有节点使用统一的 pubsub topic：
```
/waku/2/encrypted-chat/proto
```
