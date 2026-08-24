@echo off
chcp 65001 >nul
title OfferPilot · 开关控制 (Windows)

cd /d "%~dp0\.."

:: 检查 5555 端口是否已被占用 (判断服务是否正在运行)
netstat -ano 2>nul | findstr "127.0.0.1:5555" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo ========================================================
    echo 🔴 检测到 OfferPilot 服务正在运行，正在执行优雅停止...
    echo ========================================================
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr "127.0.0.1:5555" ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>nul
    )
    echo ✅ 服务已停止！
    msg * "🔴 OfferPilot：Windows 后台服务已完全关闭" 2>nul
    timeout /t 2 >nul
    exit /b 0
) else (
    echo ========================================================
    echo 🟢 正在启动 OfferPilot Windows 后台服务...
    echo ========================================================
    
    set "PYTHON_CMD="
    if exist "venv\Scripts\python.exe" (
        set "PYTHON_CMD=venv\Scripts\python.exe"
    ) else if exist "venv\Scripts\pythonw.exe" (
        set "PYTHON_CMD=venv\Scripts\pythonw.exe"
    ) else (
        where python >nul 2>nul
        if %errorlevel% equ 0 (
            set "PYTHON_CMD=python"
        ) else (
            set "PYTHON_CMD=py"
        )
    )

    start "" /B "%PYTHON_CMD%" client\server.py >nul 2>&1
    timeout /t 1 >nul
    start http://127.0.0.1:5555/
    msg * "🟢 OfferPilot：已在浏览器中启动！" 2>nul
    echo ✅ 浏览器已打开！
    timeout /t 2 >nul
    exit /b 0
)
