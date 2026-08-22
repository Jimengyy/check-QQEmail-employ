#!/bin/bash
# ==============================================================================
# OfferPilot Android 移动端独立 APK 构建与打包脚本
# ==============================================================================

PROJECT_ROOT="$(dirname "$0")/.."
cd "$PROJECT_ROOT/android-app" || exit 1

echo "================================================================="
echo "⚡️ 开始构建 OfferPilot Android 原生工程与 APK..."
echo "================================================================="

# 1. 编译 Vite 前端资源
echo "📦 正在编译前端 Warm Milk-Tea 移动端生产资源..."
npm run build || { echo "❌ 前端构建失败"; exit 1; }

# 2. 同步到 Android 原生工程
echo "🔄 正在同步静态资源到 Android 原生工程 assets..."
npx cap sync android || { echo "❌ 原生同步失败"; exit 1; }

echo ""
echo "================================================================="
echo "🎉 Android 原生工程已成功构建并同步完成！"
echo ""
echo "📱 生成的 Android 原生工程目录："
echo "   $PROJECT_ROOT/android-app/android"
echo ""
echo "🛠️ 如何在 Android Studio 中打开并一键打包 APK："
echo "   1. 运行: npx cap open android (自动用 Android Studio 打开)"
echo "   2. 在 Android Studio 顶部菜单点击: Build -> Build Bundle(s) / APK(s) -> Build APK(s)"
echo "   3. 生成的 APK 即可直接发送到任何安卓手机安装体验！"
echo "================================================================="
