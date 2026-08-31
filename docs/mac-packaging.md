# Mac 安装包构建与发布

v3.4.0 的脚本在 `osacompile` 生成临时签名后添加资源、更换图标，破坏了资源封印；同时依赖开发者机器上的 Python。新流程将 PyInstaller 独立运行环境嵌入 App，全部资源准备好后签名。保留双击启动/关闭，关闭时只匹配当前安装位置的专属可执行文件。配置只写入 `~/.config/recruitment_assistant/config.json`，不会再次破坏 App 签名。启动日志位于 `~/Library/Logs/OfferPilot/runtime.log`。

## 本地测试包

在 macOS 上使用独立虚拟环境（CI 使用 Python 3.11）：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements-mac-build.txt
.venv/bin/python -m unittest discover -s tests -p 'test_mac*.py' -v
PYTHON="$PWD/.venv/bin/python" bash scripts/build_mac_app.sh 3.4.1
```

脚本按构建 Python 的架构输出 `dist/OfferPilot-v3.4.1-macOS-arm64-unsigned.dmg` 或 `x86_64-unsigned.dmg`，附带 SHA-256 校验文件。两种架构分别在对应机器构建，不把单架构 Python 标成通用应用。

每次构建都在新的 `build/mac-<版本>-<架构>.*` 目录进行，保留旧构建，不批量删除文件夹。相同版本和架构成功构建后会更新 dist 中对应的 DMG 和校验文件。

`-unsigned` 表示尚未公证（内部代码已做临时签名以保证完整性），macOS 仍可能拦截。不要通过关闭 Gatekeeper 解决正式分发问题。签名完整性检查通过也不能证明应用经过 Apple 公证。

## Release 发布模式

Apple 证书不是在 GitHub 发布下载的前提。发布 `vX.Y.Z` Release 时，工作流按六项 Secrets 自动选择：

- 全部未配置或为空：直接构建临时签名、未公证的 `-unsigned.dmg`，验证通过后上传 Release。
- 六项完整：启用 Developer ID 签名和 Apple 公证；证书无效、公证未获 Accepted 或校验失败时停止，绝不自动降级。
- 只配置了一部分：明确列出缺失的 Secret 名称并停止，不输出凭据值。请补齐，或移除这六项配置以明确选择未公证发布。

两种模式都会上传两个架构各自的 DMG、`.sha256` 和 `.dmg.txt` 安装说明；镜像内也包含安装说明。未公证不等于签名损坏，但 macOS 首次打开仍可能拦截。确认下载来自可信项目后，参考 [Apple 官方说明](https://support.apple.com/102445) 在“隐私与安全性”中查看“仍要打开”；受管理设备可能禁止放行，不应绕过其策略或关闭全局 Gatekeeper。

## 可选：配置 Apple 公证

只有希望启用公证模式时才需要 Apple Developer Program 的 **Developer ID Application** 证书及其私钥，不能用临时或自签名证书替代。在仓库 Actions Secrets 配置：

| Secret | 内容 |
|---|---|
| `MACOS_CERTIFICATE_BASE64` | 导出的 `.p12` 证书及私钥的 Base64 内容 |
| `MACOS_CERTIFICATE_PASSWORD` | `.p12` 导出密码 |
| `MACOS_SIGNING_IDENTITY` | 完整证书名称 `Developer ID Application: … (TEAMID)` |
| `APPLE_ID` | Apple 开发者账号 |
| `APPLE_TEAM_ID` | 开发者 Team ID |
| `APPLE_APP_PASSWORD` | Apple 为该账号生成的 App 专用密码，非登录密码 |

不要将上述内容写入代码、日志或提交记录。CI 在临时钥匙串中导入凭据，结束后删除该钥匙串和临时证书文件。

CI 分别在 `macos-15`（arm64）和 `macos-15-intel`（x86_64）构建。公证模式依次执行嵌套代码签名、最终 App 签名、DMG 签名、Apple 公证、附加公证票据及镜像校验；未公证模式仍执行临时签名和完整性/运行环境检查。分支 push 和手动 workflow_dispatch 仅产生未公证 Artifact，不上传 Release，也不使用发布私钥。

本地已配置证书及 notarytool keychain profile 时可使用：

```bash
MACOS_SIGNING_IDENTITY='Developer ID Application: Your Name (TEAMID)' \
MACOS_NOTARY_PROFILE='YourNotaryProfile' \
REQUIRE_NOTARIZATION=1 \
PYTHON="$PWD/.venv/bin/python" bash scripts/build_mac_app.sh 3.4.1
```

若 profile 位于非默认钥匙串，额外设置 `MACOS_NOTARY_KEYCHAIN` 为该钥匙串路径。

正式签名仅给 Python 运行环境添加 PyObjC 所需的 `allow-jit` entitlement，不关闭库签名校验或系统 Gatekeeper。依据：[PyObjC 签名说明](https://pyobjc.readthedocs.io/en/latest/notes/codesigning.html)、[PyInstaller macOS 签名说明](https://pyinstaller.org/en/stable/feature-notes.html#macos-binary-code-signing)。

## 验证范围

构建会验证 App 及 DMG 内 App 的完整签名，在去除 `PYTHONHOME`、`PYTHONPATH` 且仅保留系统 PATH 的环境中执行内置运行环境自检，确认 Cocoa 依赖和前端资源可加载。公证模式额外验证公证票据、`notarized` 代码要求及 Gatekeeper。自检不连接 Supabase、不读取真实账号配置、不打开 GUI。

发布前仍应在未安装 Python、未关闭 Gatekeeper 的目标 Mac 上用浏览器下载正式 DMG，人工验证首次打开、双击开关、配置保存、升级后配置保留以及签名未被运行过程修改。仅 CI 自检不能替代真实 GUI 验收，也不能据此承诺所有旧版 macOS 都兼容。

## 正常发布顺序

1. 提交并推送修复分支，在 Actions 中检查两个 Mac 构建。
2. 通过 PR 合并到 `main`，不要把修复分支推送到 `main`。
3. 从包含修复的最新 `main` 创建尚未使用的 `vX.Y.Z` 标签并点击 Publish release（保存草稿不会触发）。
4. 等待两个架构构建完成，在该 Release 的 Assets 下载附件。

旧标签仍指向旧代码，重新运行旧任务或仅编辑旧 Release 说明不会应用新工作流。若旧版本发布失败，合并修复后使用新的版本标签；不要为此强推改写旧标签。
