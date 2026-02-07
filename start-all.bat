@echo off
echo ===============================================
echo   Waku Encrypted Chat - Full Demo
echo ===============================================
echo.

echo [1/2] Starting local Waku network (Docker)...
call scripts\start-local-network.bat

echo.
echo [2/2] Starting Web UI...
echo.
echo Web UI will be available at: http://localhost:5173
echo Add ?real=true to URL to connect to real Waku network
echo.

cd packages\web
node node_modules/vite/bin/vite.js
