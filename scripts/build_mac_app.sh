#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RAW_VERSION="${1:-3.4.1}"
VERSION="${RAW_VERSION#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo '版本号须为 x.y.z' >&2; exit 1; }
[[ "$(uname -s)" == Darwin ]] || { echo '只能在 macOS 上构建' >&2; exit 1; }
PYTHON="${PYTHON:-python3}"
ARCH="$("$PYTHON" -c 'import platform; print(platform.machine())')"
[[ "$ARCH" == arm64 || "$ARCH" == x86_64 ]] || exit 1
IDENTITY="${MACOS_SIGNING_IDENTITY:--}"
if [[ "$IDENTITY" != '-' && "$IDENTITY" != 'Developer ID Application: '* ]]; then
    echo '正式签名必须使用 Developer ID Application 证书名称' >&2
    exit 1
fi
if [[ "${REQUIRE_NOTARIZATION:-0}" == 1 ]]; then
    [[ "$IDENTITY" != '-' && -n "${MACOS_NOTARY_PROFILE:-}" ]] || {
        echo '正式 Release 必须配置 Developer ID 签名和公证凭据，拒绝发布临时签名包。' >&2
        exit 1
    }
fi
if [[ -n "${MACOS_NOTARY_PROFILE:-}" && "$IDENTITY" == '-' ]]; then
    echo '公证需要 Developer ID 签名，不能使用临时签名。' >&2
    exit 1
fi

# Each build uses a new directory. Never delete previous apps/build folders.
mkdir -p "$PROJECT_DIR/build" "$PROJECT_DIR/dist"
WORK_DIR="$(mktemp -d "$PROJECT_DIR/build/mac-$VERSION-$ARCH.XXXXXX")"
APP_BUNDLE="$WORK_DIR/OfferPilot.app"
DMG_ROOT="$WORK_DIR/image"
SUFFIX='-unsigned'
[[ -n "${MACOS_NOTARY_PROFILE:-}" ]] && SUFFIX=''
DMG_NAME="OfferPilot-v$VERSION-macOS-$ARCH$SUFFIX.dmg"
DMG_PATH="$WORK_DIR/$DMG_NAME"

SIGNING_ARGS=()
if [[ "$IDENTITY" != '-' ]]; then
    SIGNING_ARGS=(--codesign-identity "$IDENTITY" --osx-entitlements-file "$PROJECT_DIR/scripts/mac-runtime-entitlements.plist")
fi
# Omitting the identity uses PyInstaller's ad-hoc mode. Passing '-' explicitly
# enables hardened runtime/library validation without a Team ID and cannot load Python.
"$PYTHON" -m PyInstaller --noconfirm --onedir --windowed \
    --name OfferPilotRuntime --osx-bundle-identifier com.offerpilot.runtime --target-architecture "$ARCH" \
    ${SIGNING_ARGS[@]+"${SIGNING_ARGS[@]}"} \
    --distpath "$WORK_DIR/runtime-dist" --workpath "$WORK_DIR/pyinstaller" \
    --specpath "$WORK_DIR" --paths "$PROJECT_DIR/client" \
    --hidden-import webview.platforms.cocoa --hidden-import Quartz \
    --add-data "$PROJECT_DIR/client/widget:widget" \
    --add-data "$PROJECT_DIR/client/admin:admin" \
    "$PROJECT_DIR/client/mac_runtime.py"

osacompile -o "$APP_BUNDLE" -e '
set runner to (POSIX path of (path to me)) & "Contents/Resources/toggle_runner.sh"
do shell script "/bin/bash " & quoted form of runner
'
# All changes to the bundle happen BEFORE the final signature.
mkdir -p "$APP_BUNDLE/Contents/Helpers"
ditto "$WORK_DIR/runtime-dist/OfferPilotRuntime.app" "$APP_BUNDLE/Contents/Helpers/OfferPilotRuntime.app"
cp "$PROJECT_DIR/scripts/mac_toggle_runner.sh" "$APP_BUNDLE/Contents/Resources/toggle_runner.sh"
chmod +x "$APP_BUNDLE/Contents/Resources/toggle_runner.sh"
cp "$PROJECT_DIR/docs/assets/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/applet.icns"
/usr/bin/plutil -replace CFBundleIdentifier -string com.offerpilot.desktop "$APP_BUNDLE/Contents/Info.plist"
/usr/bin/plutil -replace CFBundleName -string OfferPilot "$APP_BUNDLE/Contents/Info.plist"
/usr/bin/plutil -replace CFBundleShortVersionString -string "$VERSION" "$APP_BUNDLE/Contents/Info.plist"
/usr/bin/plutil -replace CFBundleVersion -string "$VERSION" "$APP_BUNDLE/Contents/Info.plist"

if [[ "$IDENTITY" == '-' ]]; then
    codesign --force --sign - --timestamp=none "$APP_BUNDLE"
    echo '注意：这是完整性有效但未公证的测试包，不代表通过 Gatekeeper。'
else
    # PyInstaller has already signed the nested Python binaries inside-out.
    codesign --force --sign "$IDENTITY" --options runtime --timestamp "$APP_BUNDLE"
fi
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
# Run the embedded interpreter with no developer venv/PYTHONPATH on the search path.
/usr/bin/env -u PYTHONHOME -u PYTHONPATH PATH=/usr/bin:/bin \
    "$APP_BUNDLE/Contents/Helpers/OfferPilotRuntime.app/Contents/MacOS/OfferPilotRuntime" --self-test

mkdir -p "$DMG_ROOT"
ditto "$APP_BUNDLE" "$DMG_ROOT/OfferPilot.app"
ln -s /Applications "$DMG_ROOT/Applications"
if [[ "$SUFFIX" == '-unsigned' ]]; then
    cat > "$DMG_ROOT/测试包说明.txt" <<'NOTICE'
此包未完成 Apple 公证，仅用于开发测试，不是正式分发包。
签名完整性通过不等于 Gatekeeper 信任；macOS 仍可能阻止首次打开。
请使用经过 Developer ID 签名并公证的正式 Release，无需关闭系统安全保护。
NOTICE
fi
codesign --verify --deep --strict --verbose=2 "$DMG_ROOT/OfferPilot.app"
hdiutil create -volname "OfferPilot-v$VERSION-$ARCH" -srcfolder "$DMG_ROOT" -format UDZO "$DMG_PATH"
hdiutil verify "$DMG_PATH"

if [[ -n "${MACOS_NOTARY_PROFILE:-}" ]]; then
    codesign --sign "$IDENTITY" --timestamp "$DMG_PATH"
    NOTARY_KEYCHAIN_ARGS=()
    if [[ -n "${MACOS_NOTARY_KEYCHAIN:-}" ]]; then
        NOTARY_KEYCHAIN_ARGS=(--keychain "$MACOS_NOTARY_KEYCHAIN")
    fi
    xcrun notarytool submit "$DMG_PATH" --keychain-profile "$MACOS_NOTARY_PROFILE" \
        ${NOTARY_KEYCHAIN_ARGS[@]+"${NOTARY_KEYCHAIN_ARGS[@]}"} --wait --output-format json > "$WORK_DIR/notarization.json"
    "$PYTHON" -c 'import json,sys; r=json.load(open(sys.argv[1])); sys.exit(0 if r.get("status") == "Accepted" else "Apple 公证未通过，请检查 notarization.json")' "$WORK_DIR/notarization.json"
    xcrun stapler staple "$DMG_PATH"
    xcrun stapler validate "$DMG_PATH"
fi
# Verify what users actually receive, not just the pre-DMG bundle.
bash "$PROJECT_DIR/scripts/verify_mac_dmg.sh" "$DMG_PATH" "${REQUIRE_NOTARIZATION:-0}"
cp "$DMG_PATH" "$PROJECT_DIR/dist/$DMG_NAME"
(cd "$PROJECT_DIR/dist" && shasum -a 256 "$DMG_NAME" > "$DMG_NAME.sha256")
echo "构建完成：$PROJECT_DIR/dist/$DMG_NAME"
echo "构建记录与 App 保留在：$WORK_DIR"
