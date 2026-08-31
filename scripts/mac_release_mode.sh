#!/bin/bash
# stdout is GitHub step output; diagnostics must not expose credential values.
set -euo pipefail

present=0
missing=()
for variable in CERTIFICATE_BASE64 CERTIFICATE_PASSWORD SIGNING_IDENTITY APPLE_ID APPLE_TEAM_ID APPLE_APP_PASSWORD; do
    # Bash 3.2: unset and empty secrets both count as absent.
    if [[ -n "${!variable:-}" ]]; then
        present=$((present + 1))
    else
        missing+=("$variable")
    fi
done

if [[ "$present" == 0 ]]; then
    echo '::warning::未配置 Apple 发布凭据，将发布标注 -unsigned 的未公证安装包；macOS 首次打开可能拦截。' >&2
    echo 'mode=unsigned'
elif [[ "$present" == 6 ]]; then
    echo 'mode=notarized'
else
    # Do not silently downgrade a partly configured signing setup.
    for variable in "${missing[@]}"; do
        echo "::error::缺少 Apple 发布凭据：${variable}；请补齐，或移除全部六项凭据以发布未公证包。" >&2
    done
    exit 1
fi
