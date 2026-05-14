@echo off
echo ========================================
echo   Recruitment Assistant - Windows Launcher
echo ========================================

:: 检查 Python 是否安装
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python from python.org
    pause
    exit /b
)

:: 检查并创建虚拟环境
if not exist "venv" (
    echo [INFO] Creating virtual environment...
    python -m venv venv
)

:: 激活虚拟环境并安装依赖
echo [INFO] Activating virtual environment and installing dependencies...
call venv\Scripts\activate
pip install -r requirements.txt

:: 启动程序
echo [INFO] Starting application...
python main.py

pause
