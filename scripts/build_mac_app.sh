#!/bin/bash
set -e

# 定位到项目根目录
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="OfferPilot"
VERSION="3.3.0"
BUILD_DIR="$PROJECT_DIR/dist"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
DMG_NAME="$APP_NAME-v$VERSION-macOS.dmg"
DMG_PATH="$BUILD_DIR/$DMG_NAME"

echo "=========================================="
echo "📦 开始构建零故障原生双击开关应用: $APP_NAME.app"
echo "=========================================="

rm -rf "$APP_BUNDLE" "$DMG_PATH"

# 1. 使用 osacompile 生成轻量级 Applet
osacompile -o "$APP_BUNDLE" -e '
set my_path to POSIX path of (path to me)
if my_path ends with "/" then
    set runner to my_path & "Contents/Resources/toggle_runner.sh"
else
    set runner to my_path & "/Contents/Resources/toggle_runner.sh"
end if
do shell script "bash \"" & runner & "\""
'

# 2. 注入资源文件到 Contents/Resources
mkdir -p "$APP_BUNDLE/Contents/Resources"
cp -r "$PROJECT_DIR/client/widget" "$APP_BUNDLE/Contents/Resources/"
cp -r "$PROJECT_DIR/client/admin" "$APP_BUNDLE/Contents/Resources/"
cp "$PROJECT_DIR/client/main.py" "$APP_BUNDLE/Contents/Resources/"
cp "$PROJECT_DIR/client/server.py" "$APP_BUNDLE/Contents/Resources/"
cp "$PROJECT_DIR/config.example.json" "$APP_BUNDLE/Contents/Resources/"

# 3. 创建极简健壮的 toggle_runner.sh
cat << 'RUNNER_EOF' > "$APP_BUNDLE/Contents/Resources/toggle_runner.sh"
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

PID=$(pgrep -f "python.*main.py")

if [ -n "$PID" ]; then
    pkill -f "python.*main.py" || true
    pkill -f "python.*server.py" || true
    rm -f "$DIR/app.lock" "$HOME/.config/recruitment_assistant/app.lock" app.lock 2>/dev/null || true
    osascript -e 'display notification "🔴 OfferPilot：已完全关闭" with title "OfferPilot"' 2>/dev/null || true
else
    rm -f "$DIR/app.lock" "$HOME/.config/recruitment_assistant/app.lock" app.lock 2>/dev/null || true

    if [ -f "$DIR/../../../../venv/bin/python" ]; then
        PYTHON_EXEC="$DIR/../../../../venv/bin/python"
    elif [ -f "$DIR/../../venv/bin/python" ]; then
        PYTHON_EXEC="$DIR/../../venv/bin/python"
    elif [ -f "/Users/laq/Desktop/拉取招聘信息/venv/bin/python" ]; then
        PYTHON_EXEC="/Users/laq/Desktop/拉取招聘信息/venv/bin/python"
    else
        PYTHON_EXEC="python3"
    fi

    nohup "$PYTHON_EXEC" main.py > /tmp/offerpilot.log 2>&1 &
    osascript -e 'display notification "🟢 OfferPilot：已在桌面启动" with title "OfferPilot"' 2>/dev/null || true
fi
RUNNER_EOF
chmod +x "$APP_BUNDLE/Contents/Resources/toggle_runner.sh"

# 4. 注入高清全新图标
if [ -f "$PROJECT_DIR/docs/assets/AppIcon.icns" ]; then
    cp "$PROJECT_DIR/docs/assets/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/applet.icns"
    cp "$PROJECT_DIR/docs/assets/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
fi

# 清理隔离属性
xattr -cr "$APP_BUNDLE" 2>/dev/null || true

echo "✅ 原生双击开关 App 打包完成: $APP_BUNDLE"

# 5. 生成标准 .dmg 磁盘镜像
echo "=========================================="
echo "💿 正在生成原生双击开关版 Mac 安装镜像: $DMG_NAME ..."
echo "=========================================="

DMG_TMP="$BUILD_DIR/dmg_tmp"
rm -rf "$DMG_TMP"
mkdir -p "$DMG_TMP"

cp -R "$APP_BUNDLE" "$DMG_TMP/"
ln -s /Applications "$DMG_TMP/拖动到此处安装 (Applications)"
cp "$PROJECT_DIR/config.example.json" "$DMG_TMP/config.example.json"

hdiutil create -volname "OfferPilot-v$VERSION" -srcfolder "$DMG_TMP" -ov -format UDZO "$DMG_PATH"
rm -rf "$DMG_TMP"

echo "=========================================="
echo "🎉 终极原生双击开关版 Release 构建成功！"
echo "👉 1. 应用本体 (100%原生双击开/双击关): $APP_BUNDLE"
echo "👉 2. 发行安装包: $DMG_PATH"
echo "=========================================="
