@echo off
chcp 65001 >nul
title OfferPilot · 启动 Web 控制台 (Windows)

cd /d "%~dp0\.."

set "PYTHON_CMD="
if exist "venv\Scripts\python.exe" (
    set "PYTHON_CMD=venv\Scripts\python.exe"
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PYTHON_CMD=python"
    ) else (
        set "PYTHON_CMD=py"
    )
)

echo ========================================================
echo   ✦ 启动 OfferPilot 纯 Web 管理服务 (Windows)
echo ========================================================
echo 👉 请在浏览器中打开: http://127.0.0.1:5555/
echo 👉 按 Ctrl+C 或关闭本窗口可停止服务
echo ========================================================

start http://127.0.0.1:5555/
%PYTHON_CMD% client\server.py
