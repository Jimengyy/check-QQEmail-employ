@echo off
chcp 65001 >nul
title OfferPilot · 求职全景智能助手

:: 定位到当前脚本所在目录
cd /d "%~dp0"

echo ========================================================
echo   ✦ OfferPilot 求职全景智能助手 (Windows 网页看板)
echo ========================================================
echo.

:: 1. 智能探测可用 Python 解释器 (优先检查项目内置虚拟环境)
set "PYTHON_CMD="
if exist "venv\Scripts\python.exe" (
    set "PYTHON_CMD=venv\Scripts\python.exe"
) else if exist "..\venv\Scripts\python.exe" (
    set "PYTHON_CMD=..\venv\Scripts\python.exe"
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PYTHON_CMD=python"
    ) else (
        where py >nul 2>nul
        if %errorlevel% equ 0 (
            set "PYTHON_CMD=py"
        )
    )
)

if "%PYTHON_CMD%"=="" (
    echo [❌ 错误] 未检测到 Python 运行环境！
    echo.
    echo 💡 解决办法：
    echo 1. 请前往 https://www.python.org/downloads/ 下载并安装 Python 3.9+；
    echo 2. 安装时请务必勾选 "Add python.exe to PATH"（添加到环境变量）。
    echo.
    pause
    exit /b 1
)

:: 2. 检查并自动安装轻量 Web 依赖 (Flask)
%PYTHON_CMD% -c "import flask" >nul 2>nul
if %errorlevel% neq 0 (
    echo [📦 初始化] 正在自动安装运行依赖 (Flask)...
    %PYTHON_CMD% -m pip install flask -q
    if %errorlevel% neq 0 (
        echo [⚠️ 提示] 依赖自动安装遇到问题，尝试使用 requirements.txt...
        %PYTHON_CMD% -m pip install -r requirements.txt
    )
)

:: 3. 检查 5555 服务端口是否已被占用 (防重复启动)
netstat -ano 2>nul | findstr "127.0.0.1:5555" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [🟢 服务已在运行] 检测到 OfferPilot 后台服务已处于运行状态！
    echo [🌐 正在打开浏览器] 正在为您唤起全景看板...
    start http://127.0.0.1:5555/
    echo.
    echo 💡 提示：若需重启服务，请关闭现有窗口或运行 scripts\toggle_windows.bat
    timeout /t 3 >nul
    exit /b 0
)

:: 4. 启动服务并在 Windows 默认浏览器中打开全景看板
echo [🚀 正在启动] 本地 Web 管理控制台已启动 (端口: 5555)...
echo [🌐 正在打开浏览器] 宽屏看板地址: http://127.0.0.1:5555/
echo.
echo --------------------------------------------------------
echo  💡 使用指南：
echo  1. 浏览器已自动打开，首次使用请在网页弹窗中输入 Supabase 数据库凭证；
echo  2. 保持此窗口开启即可持续使用；关闭此黑窗口即可停止服务。
echo --------------------------------------------------------
echo.

:: 延迟 0.5 秒唤起浏览器，确保端口就绪
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:5555/"

:: 前台运行服务
%PYTHON_CMD% client\server.py
