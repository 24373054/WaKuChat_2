#!/bin/bash
echo "========================================"
echo "  WakuChat - 去中心化加密聊天"
echo "========================================"
echo

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    pnpm install || { echo "安装失败，请确保已安装 pnpm"; exit 1; }
fi

# 检查是否已构建
if [ ! -d "packages/sdk/dist" ]; then
    echo "正在构建项目..."
    pnpm build || { echo "构建失败"; exit 1; }
fi

echo
echo "启动 Web 应用..."
echo "访问: http://localhost:5173"
echo
echo "模式说明:"
echo "  默认: 公共 Waku 网络（无需服务器）"
echo "  ?local=true: 连接本地 Waku 网络"
echo "  ?mock=true: Mock 模式（本地开发）"
echo

cd packages/web
npx vite
