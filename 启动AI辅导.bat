@echo off
chcp 65001 >nul
title 曾练专属私教 AI Tutor

echo ============================================
echo   曾练专属私教 Launcher
echo ============================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 Node.js！请先安装 Node.js。
    echo         下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: Install server dependencies if needed
if not exist "node_modules" (
    echo [1/3] Installing server dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] 依赖安装失败！
        pause
        exit /b 1
    )
) else (
    echo [1/3] Server dependencies OK.
)

:: Build frontend if needed
if not exist "client\dist" (
    echo [2/3] Building frontend...
    cd client
    if not exist "node_modules" (
        call npm install
    )
    call npm run build
    cd ..
    if %errorlevel% neq 0 (
        echo [ERROR] 前端构建失败！
        pause
        exit /b 1
    )
) else (
    echo [2/3] Frontend build OK.
)

:: Start server
echo [3/3] Starting AI Tutor server...
echo.
echo   访问地址: http://localhost:3001
echo   按 Ctrl+C 停止服务
echo ============================================
echo.

node start.js

echo.
echo Server closed or crashed!
pause
