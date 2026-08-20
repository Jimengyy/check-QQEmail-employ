#!/bin/bash
# 定位到项目根目录
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=========================================="
echo "🌐 启动 OfferPilot 纯 Web 管理服务 (无桌面窗口)"
echo "=========================================="

if [ -f "$PROJECT_DIR/venv/bin/python" ]; then
    PYTHON_EXEC="$PROJECT_DIR/venv/bin/python"
else
    PYTHON_EXEC="python3"
fi

echo "👉 请在浏览器中打开: http://127.0.0.1:5555/"
echo "👉 按 Ctrl+C 可停止服务"
echo "=========================================="

exec $PYTHON_EXEC client/server.py
