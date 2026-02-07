@echo off
echo ========================================
echo   WakuChat - 去中心化加密聊天
echo ========================================
echo.

REM 检查是否已安装依赖
if not exist "node_modules" (
    echo 正在安装依赖...
    call pnpm install
    if errorlevel 1 (
        echo 安装失败，请确保已安装 pnpm
        pause
        exit /b 1
    )
)

REM 检查是否已构建
if not exist "packages\sdk\dist" (
    echo 正在构建项目...
    call pnpm build
    if errorlevel 1 (
        echo 构建失败
        pause
        exit /b 1
    )
)

echo.
echo 启动 Web 应用...
echo 访问: http://localhost:5173
echo.
echo 模式说明:
echo   默认: 公共 Waku 网络（无需服务器）
echo   ?local=true: 连接本地 Waku 网络
echo   ?mock=true: Mock 模式（本地开发）
echo.
cd packages\web
node node_modules\vite\bin\vite.js
