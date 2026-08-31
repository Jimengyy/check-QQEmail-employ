#!/bin/bash
set -euo pipefail
DMG_PATH="$1"
REQUIRE_NOTARIZATION="${2:-0}"
MOUNT_POINT="$(mktemp -d "${TMPDIR:-/tmp}/offerpilot-verify.XXXXXX")"
MOUNTED=0
cleanup() {
    if [[ "$MOUNTED" == 1 ]]; then hdiutil detach "$MOUNT_POINT"; fi
    rmdir "$MOUNT_POINT"
}
trap cleanup EXIT
hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$MOUNT_POINT" "$DMG_PATH"
MOUNTED=1
APP="$MOUNT_POINT/OfferPilot.app"
codesign --verify --deep --strict --verbose=2 "$APP"
/usr/bin/env -u PYTHONHOME -u PYTHONPATH PATH=/usr/bin:/bin \
    "$APP/Contents/Helpers/OfferPilotRuntime.app/Contents/MacOS/OfferPilotRuntime" --self-test
if [[ "$REQUIRE_NOTARIZATION" == 1 ]]; then
    # This requirement still verifies notarization if local Gatekeeper is disabled.
    codesign --verify --deep --strict -R='notarized' "$APP"
    xcrun stapler validate "$DMG_PATH"
    spctl --assess --type execute --verbose=4 "$APP"
fi
