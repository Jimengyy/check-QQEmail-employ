#!/bin/bash
# 定位到项目根目录
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# 查找运行中的 main.py 进程
PID=$(pgrep -f "python.*client/main.py|python.*main.py")

if [ -n "$PID" ]; then
    # 已运行，执行优雅关闭
    pkill -f "python.*client/main.py" || true
    pkill -f "python.*main.py" || true
    rm -f client/app.lock app.lock
    osascript -e 'display notification "🔴 招聘助手：已关闭" with title "招聘智能助手 V3.0"'
else
    # 未运行，启动后台挂件
    if [ -f "$PROJECT_DIR/venv/bin/python" ]; then
        PYTHON_EXEC="$PROJECT_DIR/venv/bin/python"
    else
        PYTHON_EXEC="python3"
    fi
    
    nohup $PYTHON_EXEC client/main.py > /dev/null 2>&1 &
    osascript -e 'display notification "🟢 招聘助手：已在桌面启动 (V3.0 云原生)" with title "招聘智能助手 V3.0"'
fi
