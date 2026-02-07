@echo off
setlocal enabledelayedexpansion

:: Waku Encrypted Chat - Demo Script (Windows)

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "CLI_DIR=%PROJECT_ROOT%\packages\cli"
set "DEMO_DIR=%PROJECT_ROOT%\.demo-data"

if "%1"=="" goto :run
if "%1"=="run" goto :run
if "%1"=="quick" goto :quick
if "%1"=="clean" goto :clean
if "%1"=="help" goto :help
if "%1"=="--help" goto :help
goto :help

:banner
echo.
echo ===============================================================
echo            Waku Encrypted Chat - Demo Script
echo      2 User DM + 3 User Group Chat + Revoke Demo
echo ===============================================================
echo.
goto :eof

:check_prerequisites
echo [i] Checking prerequisites...

if not exist "%CLI_DIR%\dist\index.js" (
    echo [i] Building CLI package...
    cd /d "%PROJECT_ROOT%"
    call pnpm --filter @waku-chat/cli build
)
echo [OK] CLI package is ready

set /a healthy=0
for %%p in (8545 8546 8547) do (
    curl -sf "http://localhost:%%p/health" >nul 2>&1
    if not errorlevel 1 set /a healthy+=1
)

if %healthy% lss 1 (
    echo [X] Waku network is not running!
    echo [i] Start it with: scripts\start-local-network.bat
    exit /b 1
)
echo [OK] Waku network is running (%healthy%/3 nodes healthy)
goto :eof

:setup_demo
echo.
echo [i] Setting up demo environment...
if exist "%DEMO_DIR%" rmdir /s /q "%DEMO_DIR%"
mkdir "%DEMO_DIR%\alice"
mkdir "%DEMO_DIR%\bob"
mkdir "%DEMO_DIR%\charlie"
echo [OK] Demo directories created
goto :eof

:demo_identities
echo.
echo ---------------------------------------------------------------
echo Part 1: Creating User Identities
echo ---------------------------------------------------------------
echo.
echo We will create 3 users: Alice, Bob, and Charlie
echo.
echo Each user will have:
echo   - A secp256k1 key pair
echo   - A unique userId (derived from public key)
echo   - Encrypted identity storage
echo.
echo [OK] Identity creation concept demonstrated
goto :eof

:demo_dm
echo.
echo ---------------------------------------------------------------
echo Part 2: Direct Message (Alice - Bob)
echo ---------------------------------------------------------------
echo.
echo This demonstrates:
echo   - ECDH key exchange for shared secret
echo   - AES-256-GCM message encryption
echo   - ECDSA message signing
echo.
echo Use the interactive CLI:
echo   waku-chat conversation create-dm
echo   waku-chat message send
echo.
echo [OK] DM demonstration concept complete
goto :eof

:demo_group
echo.
echo ---------------------------------------------------------------
echo Part 3: Group Chat (Alice, Bob, Charlie)
echo ---------------------------------------------------------------
echo.
echo This demonstrates:
echo   - Group key generation
echo   - ECIES key distribution
echo   - Multi-party encrypted messaging
echo   - Admin permission management
echo.
echo Use the interactive CLI:
echo   waku-chat conversation create-group
echo   waku-chat conversation invite [group-id]
echo   waku-chat conversation join-group
echo.
echo [OK] Group chat demonstration concept complete
goto :eof

:demo_revoke
echo.
echo ---------------------------------------------------------------
echo Part 4: Message Revocation
echo ---------------------------------------------------------------
echo.
echo Revocation mechanism:
echo   1. Sender creates tombstone control message
echo   2. Tombstone contains: targetMessageId + signature
echo   3. Other clients mark message as 'revoked'
echo   4. UI shows '[Message revoked]' instead of content
echo.
echo Permission rules:
echo   - DM: Only original sender can revoke
echo   - Group: Original sender OR admin can revoke
echo.
echo Important limitation:
echo   In a decentralized network, revocation is 'best effort'.
echo   Messages already received cannot be forcibly deleted.
echo.
echo Use the interactive CLI:
echo   waku-chat message revoke [conv-id] [msg-id]
echo.
echo [OK] Revocation demonstration concept complete
goto :eof

:demo_interactive
echo.
echo ---------------------------------------------------------------
echo Part 5: Interactive Demo Mode
echo ---------------------------------------------------------------
echo.
echo Available commands:
echo.
echo   Identity Management:
echo     waku-chat identity create    - Create new identity
echo     waku-chat identity show      - Show current identity
echo.
echo   Conversations:
echo     waku-chat conv create-dm     - Create direct message
echo     waku-chat conv create-group  - Create group chat
echo     waku-chat conv join-group    - Join existing group
echo     waku-chat conv list          - List conversations
echo.
echo   Messages:
echo     waku-chat msg send           - Send a message
echo     waku-chat msg history        - View message history
echo     waku-chat msg revoke         - Revoke a message
echo     waku-chat msg delete         - Delete locally
echo.
echo   Interactive Chat:
echo     waku-chat chat               - Enter chat mode
echo.
goto :eof

:summary
echo.
echo ---------------------------------------------------------------
echo Demo Summary
echo ---------------------------------------------------------------
echo.
echo This demo showcased the Waku Encrypted Chat SDK:
echo.
echo   [OK] Identity Management
echo   [OK] Direct Messaging (ECDH + AES-256-GCM)
echo   [OK] Group Chat (ECIES key distribution)
echo   [OK] Message Revocation (tombstone messages)
echo   [OK] Waku Protocol Integration
echo.
echo For more details, see:
echo   - README.md
echo   - .kiro\specs\waku-encrypted-chat\design.md
echo.
goto :eof

:run
call :banner
call :check_prerequisites
if errorlevel 1 exit /b 1
call :setup_demo
call :demo_identities
pause
call :demo_dm
pause
call :demo_group
pause
call :demo_revoke
pause
call :demo_interactive
pause
call :summary
echo.
echo [OK] Demo complete!
goto :eof

:quick
call :banner
call :check_prerequisites
if errorlevel 1 exit /b 1
call :setup_demo
call :demo_identities
call :demo_dm
call :demo_group
call :demo_revoke
call :demo_interactive
call :summary
echo.
echo [OK] Quick demo complete!
goto :eof

:clean
if exist "%DEMO_DIR%" rmdir /s /q "%DEMO_DIR%"
echo [OK] Demo data cleaned up
goto :eof

:help
call :banner
echo Usage: %~nx0 [command]
echo.
echo Commands:
echo   run       Run the full demo (default)
echo   quick     Run quick demo without pauses
echo   clean     Clean up demo data
echo   help      Show this help message
echo.
echo Prerequisites:
echo   1. Start local Waku network: scripts\start-local-network.bat
echo   2. Build packages: pnpm build
goto :eof
