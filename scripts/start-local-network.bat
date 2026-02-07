@echo off
setlocal enabledelayedexpansion

:: Waku Encrypted Chat - Local Network Startup Script (Windows)

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "DOCKER_DIR=%PROJECT_ROOT%\docker"

:: Check command
if "%1"=="" goto :start
if "%1"=="start" goto :start
if "%1"=="stop" goto :stop
if "%1"=="status" goto :status
if "%1"=="clean" goto :clean
if "%1"=="help" goto :help
if "%1"=="--help" goto :help
if "%1"=="-h" goto :help

echo [!] Unknown command: %1
goto :help

:banner
echo.
echo ===============================================================
echo          Waku Encrypted Chat - Local Test Network
echo ===============================================================
echo.
goto :eof

:check_docker
docker info >nul 2>&1
if errorlevel 1 (
    echo [X] Docker is not running. Please start Docker Desktop.
    exit /b 1
)
echo [OK] Docker is available
goto :eof

:start
call :banner
call :check_docker
if errorlevel 1 exit /b 1

echo [i] Starting Waku test network (3 nodes)...
cd /d "%DOCKER_DIR%"

echo [i] Pulling nwaku images...
docker compose pull

echo [i] Starting containers...
docker compose up -d

echo [i] Waiting for nodes to be healthy...

:: Wait for nodes
set /a waited=0
set /a max_wait=120

:wait_loop
if %waited% geq %max_wait% goto :check_final

set /a healthy=0
for %%i in (1 2 3) do (
    set /a port=18544+%%i
    curl -sf "http://localhost:!port!/health" >nul 2>&1
    if not errorlevel 1 set /a healthy+=1
)

if %healthy%==3 goto :check_final

echo   Waiting... (%healthy%/3 nodes healthy, %waited%s elapsed)
timeout /t 5 /nobreak >nul
set /a waited+=5
goto :wait_loop

:check_final
echo.
echo [i] Node Status:
echo   +----------+----------+-----------------+
echo   ^|  Node    ^|  Status  ^|    REST API     ^|
echo   +----------+----------+-----------------+

for %%i in (1 2 3) do (
    set /a port=18544+%%i
    curl -sf "http://localhost:!port!/health" >nul 2>&1
    if errorlevel 1 (
        echo   ^| nwaku%%i   ^| unhealthy^| localhost:!port! ^|
    ) else (
        echo   ^| nwaku%%i   ^|  healthy ^| localhost:!port! ^|
    )
)

echo   +----------+----------+-----------------+
echo.
echo [OK] Network started!
echo.
echo [i] To view logs:
echo     cd docker ^&^& docker compose logs -f
echo.
echo [i] To stop the network:
echo     scripts\start-local-network.bat stop
goto :eof

:stop
call :banner
echo [i] Stopping Waku test network...
cd /d "%DOCKER_DIR%"
docker compose down
echo [OK] Network stopped
goto :eof

:status
call :banner
echo [i] Checking network status...
cd /d "%DOCKER_DIR%"
docker compose ps
echo.
echo [i] Node Health:
for %%i in (1 2 3) do (
    set /a port=18544+%%i
    curl -sf "http://localhost:!port!/health" >nul 2>&1
    if errorlevel 1 (
        echo [X] nwaku%%i (port !port!): unhealthy or not running
    ) else (
        echo [OK] nwaku%%i (port !port!): healthy
    )
)
goto :eof

:clean
call :banner
echo [!] This will remove all containers and volumes!
set /p confirm="Are you sure? (y/N) "
if /i not "%confirm%"=="y" (
    echo [i] Cancelled
    goto :eof
)
echo [i] Cleaning up Waku test network...
cd /d "%DOCKER_DIR%"
docker compose down -v --remove-orphans
echo [OK] Network cleaned
goto :eof

:help
call :banner
echo Usage: %~nx0 [command]
echo.
echo Commands:
echo   start   Start the local Waku test network (default)
echo   stop    Stop the network
echo   status  Show network status
echo   clean   Stop and remove all containers and volumes
echo   help    Show this help message
echo.
echo Examples:
echo   %~nx0              # Start the network
echo   %~nx0 start        # Start the network
echo   %~nx0 stop         # Stop the network
echo   %~nx0 status       # Check node status
goto :eof
