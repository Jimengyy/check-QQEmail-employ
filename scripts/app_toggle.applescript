set my_path to POSIX path of (path to me)

set sh_code to "bash -c '" & "
if [[ \"" & my_path & "\" == *.app* ]]; then
    APP_DIR=\"" & my_path & "\"
    APP_DIR=\".app\"
    RES_DIR=\"$APP_DIR/Contents/Resources\"
else
    RES_DIR=\"/Users/laq/Desktop/拉取招聘信息/client\"
fi

PID=$(pgrep -f \"python.*client/main.py|python.*main.py\" || true)

if [ -n \"$PID\" ]; then
    pkill -f \"python.*client/main.py\" || true
    pkill -f \"python.*main.py\" || true
    pkill -f \"python.*server.py\" || true
    rm -f \"$RES_DIR/app.lock\" \"$HOME/.config/recruitment_assistant/app.lock\" 2>/dev/null || true
    osascript -e \"display notification \\\"🔴 OfferPilot：已完全关闭\\\" with title \\\"OfferPilot\\\"\" 2>/dev/null || true
else
    if [ -f \"$RES_DIR/../../../../venv/bin/python\" ]; then
        PY_EXEC=\"$RES_DIR/../../../../venv/bin/python\"
    elif [ -f \"$RES_DIR/../../../venv/bin/python\" ]; then
        PY_EXEC=\"$RES_DIR/../../../venv/bin/python\"
    elif [ -f \"$RES_DIR/../../venv/bin/python\" ]; then
        PY_EXEC=\"$RES_DIR/../../venv/bin/python\"
    elif [ -f \"/Users/laq/Desktop/拉取招聘信息/venv/bin/python\" ]; then
        PY_EXEC=\"/Users/laq/Desktop/拉取招聘信息/venv/bin/python\"
    else
        PY_EXEC=\"python3\"
    fi
    cd \"$RES_DIR\"
    nohup $PY_EXEC main.py > /tmp/offerpilot.log 2>&1 &
    osascript -e \"display notification \\\"🟢 OfferPilot：已在桌面启动\\\" with title \\\"OfferPilot\\\"\" 2>/dev/null || true
fi
'"

do shell script sh_code
