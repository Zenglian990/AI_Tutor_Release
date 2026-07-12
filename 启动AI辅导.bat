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
    if not errorlevel 1 set "has_key=1"
)

if "%has_key%"=="0" (
    echo ============================================================
    echo   欢迎使用曾练专属私教 AI Tutor！
    echo ============================================================
    echo   首次运行需要配置您的 Gemini API Key。
    echo   您可以前往 Google AI Studio ^(https://aistudio.google.com/^) 免费申请。
    echo ============================================================
    echo.
    set /p user_key="请输入您的 Gemini API Key: "
    
    :: Write to .env, preventing duplicate
    findstr /C:"GEMINI_API_KEY=" .env >nul 2>&1
    if errorlevel 1 (
        echo.>>.env
        echo GEMINI_API_KEY=%user_key%>>.env
        echo [INFO] 已成功将您的 Gemini API Key 写入 .env 文件。
    ) else (
        echo [INFO] .env 中已存在 GEMINI_API_KEY，跳过写入。
    )
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

set "FORCE_BUILD=0"
for %%A in (%*) do (
    if "%%A"=="--build" set "FORCE_BUILD=1"
)

:: Build frontend if needed
set "NEED_BUILD=0"
if not exist "client\dist" set "NEED_BUILD=1"
if "%FORCE_BUILD%"=="1" set "NEED_BUILD=1"

if "%NEED_BUILD%"=="1" (
    echo [2/3] Building frontend...
    cd client
    if not exist "node_modules" (
        call npm install
    )
    if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite"
    if exist ".vite" rmdir /s /q ".vite"
    if exist ".vite-temp" rmdir /s /q ".vite-temp"
    call npm run build
    if errorlevel 1 (
        echo [ERROR] 前端构建失败！
        cd ..
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [2/3] Frontend build OK. ^(Run with --build to force rebuild^)
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
