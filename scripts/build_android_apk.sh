#!/usr/bin/env bash
# ==============================================================================
# OfferPilot Android APK 一键构建与资源同步脚本
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$PROJECT_ROOT/mobile"
ANDROID_DIR="$MOBILE_DIR/android"
ASSETS_DEST="$ANDROID_DIR/app/src/main/assets/public"
DIST_DIR="$PROJECT_ROOT/dist"

echo "=================================================="
echo "🚀 OfferPilot Mobile V3.3.0 · 开始准备构建 APK"
echo "=================================================="

# 1. 确保目标目录存在并同步前端资源
echo "📦 正在同步移动端前端白瓷 UI 静态资产..."
mkdir -p "$ASSETS_DEST"
mkdir -p "$DIST_DIR"

rm -rf "$ASSETS_DEST"/*
cp -r "$MOBILE_DIR/src/"* "$ASSETS_DEST/"
echo "✅ 前端白瓷 UI 资产已成功同步至 Android assets/public"

# 2. 检查 Java / Gradle 环境
echo "🔍 检查本地构建环境..."

if command -v java >/dev/null 2>&1; then
    JAVA_VER=$(java -version 2>&1 | head -n 1)
    echo "☕️ 发现 Java 环境: $JAVA_VER"
    
    cd "$ANDROID_DIR"
    if [ -f "./gradlew" ]; then
        chmod +x ./gradlew
        echo "🔨 正在执行 Gradle 编译 assembleDebug..."
        ./gradlew assembleDebug --no-daemon
        
        APK_SRC="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
        if [ -f "$APK_SRC" ]; then
            cp "$APK_SRC" "$DIST_DIR/OfferPilot-v3.3.0.apk"
            echo "=================================================="
            echo "🎉 APK 构建成功！"
            echo "📁 产物路径: $DIST_DIR/OfferPilot-v3.3.0.apk"
            echo "=================================================="
            exit 0
        fi
    fi
fi

echo "⚠️ 本地未检测到完整 Android SDK / JDK 编译链。"
echo "💡 提示：您可直接使用云端打包通道（推荐）或在 GitHub 上一键触发打包："
echo "   1. 推送代码至 GitHub 仓库；"
echo "   2. 进入 Actions 页面点击 'Build Android APK' -> 'Run workflow'；"
echo "   3. 2 分钟后即可直接在页面下载 OfferPilot-v3.3.0.apk 安装包并安装到手机！"
echo "=================================================="
