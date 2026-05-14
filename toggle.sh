#!/bin/bash
# 定位到项目根目录
cd "$(dirname "$0")"

# 更加宽松的进程匹配，只查找 main.py
PID=$(pgrep -f "main.py")

if [ -n "$PID" ]; then
    # 使用 pkill 确保彻底关闭
    pkill -f "main.py"
    osascript -e 'display notification "🔴 招聘助手：已成功关闭" with title "状态提醒"'
else
    # 启动逻辑
    if [ -d ".venv" ]; then
        source .venv/bin/activate
    fi
    # 确保在后台启动
    nohup python3 main.py > /dev/null 2>&1 &
    osascript -e 'display notification "🟢 招聘助手：已在后台启动" with title "状态提醒"'
fi
