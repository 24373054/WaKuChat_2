@echo off
setlocal EnableDelayedExpansion

echo ===============================================
echo   Waku Encrypted Chat - Web Demo
echo ===============================================
echo.

echo Starting Vite dev server...
echo.
echo Web UI: http://localhost:5173
echo.
echo Mock mode - messages work across browser tabs
echo.

pushd "%~dp0packages\web"
call node "node_modules\vite\bin\vite.js"
popd
