# OfferPilot · Windows 极简双击启动与网页全景看板方案 (V3.4)

---

## 摘要 (Executive Summary)

**OfferPilot (求职全景智能助手 V3.4)** 为 Windows 用户提供与 macOS 平齐的极致体验：

* **极简双击即用 (Double-Click & Go)**：Windows 用户在根目录双击 **`启动招聘助手.bat`**，后台自动拉起轻量服务并**直接在 Windows 默认浏览器打开宽屏全景看板**；
* **摒弃桌面挂件 (No Desktop Widget)**：彻底移除桌面透明浮窗/挂件的复杂依赖，专注提供纯粹、流畅的**全屏 PC 级求职管理看板**；
* **网页端零门槛配置 (In-Browser Config)**：用户首次打开网页时，直接在网页弹出的配置窗口中输入 **Supabase 数据库网址 (URL)** 和 **公开密钥 (Anon Key)**，点击保存即可秒级完成云端绑定并开启 7x24h 实时同步！

---

## 一、 系统架构与运行流程 (Architecture & Flow)

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 Windows 用户
    participant Bat as ⚡️ 启动招聘助手.bat
    participant Server as 🐍 本地轻量 Web 服务 (client/server.py)
    participant Browser as 🌐 Windows 默认浏览器 (Edge / Chrome)
    participant Cloud as ☁️ Supabase 云数据库

    User->>Bat: 1. 双击运行【启动招聘助手.bat】
    Bat->>Server: 2. 自动检测环境并静默启动本地服务 (127.0.0.1:5555)
    Bat->>Browser: 3. 自动拉起浏览器并跳转 http://127.0.0.1:5555/
    Browser->>Browser: 4. 检测是否已绑定数据库 (首次自动弹出配置弹窗)
    User->>Browser: 5. 在网页端输入 Supabase 网址与密钥并点击【保存】
    Browser->>Server: 6. 自动持久化保存配置到本地
    Browser<->>Cloud: 7. 建立 WebSocket Realtime 实时通道，全景看板秒级呈现！
```

---

## 二、 Windows 专属脚本生态

1. **`启动招聘助手.bat`（根目录主入口）**
   - 自动检测并优先使用 `venv` 或系统 `python`；
   - 自动检测并安装必要依赖 `flask`；
   - 检查端口占用防重复启动；
   - 延迟 1 秒安全唤起系统默认浏览器（Edge / Chrome / Firefox 等）打开 `http://127.0.0.1:5555/`。

2. **`scripts/toggle_windows.bat`（智能双击开关）**
   - 端口运行检测：若 5555 正在监听，自动查找 PID 优雅关闭服务并弹窗提醒；
   - 若未运行：后台静默启动服务并唤起浏览器。

3. **`scripts/start_windows.bat`（纯 Web 服务启动脚本）**
   - 适用于命令行开发者直接调试与运行。

---

## 三、 网页端零门槛配置体验

* **自动识别未配置状态**：首次通过浏览器访问 `http://127.0.0.1:5555/` 时，若未检测到数据库凭据，页面立即平滑弹出 **「⚙️ Supabase 云数据库配置」** 模态窗口；
* **一键保存并自动加载**：用户填入 `Project URL` 和 `Anon Public Key` 后，前端自动发送至 `/api/save_config` 进行本地落盘保存（保存于 Windows `%USERPROFILE%\.config\recruitment_assistant\config.json` 及项目内 `config.json`），同时存入浏览器 `localStorage`；
* **即时连通**：点击保存后即刻连接云端，Bento 指标卡与求职列表瞬间加载完成。
