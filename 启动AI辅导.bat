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

:: Check if .env has GEMINI_API_KEY
set "has_key=0"
if exist ".env" (
    findstr /C:"GEMINI_API_KEY=" .env >nul
    if %errorlevel% equ 0 set "has_key=1"
)

if "%has_key%"=="0" (
    echo ============================================================
    echo   欢迎使用曾练专属私教 AI Tutor！
    echo ============================================================
    echo   首次运行需要配置您的 Gemini API Key。
    echo   您可以前往 Google AI Studio (https://aistudio.google.com/) 免费申请。
    echo ============================================================
    echo.
    set /p user_key="请输入您的 Gemini API Key: "
    
    :: Write to .env
    echo.>>.env
    echo GEMINI_API_KEY=%user_key%>>.env
    echo [INFO] 已成功将您的 Gemini API Key 写入 .env 文件。
    echo.
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
