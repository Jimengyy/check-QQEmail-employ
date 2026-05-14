# 🚀 AI Recruitment Assistant (招聘助手)

一个优雅、智能的跨平台桌面招聘信息聚合工具。它能自动从你的邮箱中拉取招聘邮件，利用 AI 技术进行深度解析，并将面试、笔试、测评等任务以高颜值的玻璃拟态 (Glassmorphism) UI 展示在桌面上。

![Demo](https://via.placeholder.com/350x600/2c3e50/ffffff?text=Recruitment+Assistant+UI)

## ✨ 核心特性

- **🤖 智能 AI 解析**：基于 DeepSeek/OpenAI API，自动识别邮件意图，提取公司、时间、任务类型（线上面试、笔试、测评等）。
- **💻 跨平台支持**：
  - **macOS**: 极致挂件体验。支持隐藏 Dock 图标、固定桌面底层、不参与系统窗口循环切换。
  - **Windows**: 极简悬浮窗模式。支持窗口置顶显示，适配微软雅黑字体。
- **📦 任务管理**：
  - **动态分类**：自动识别 Offer、入职、资料补充等非标任务。
  - **历史归档**：支持任务折叠展示，清晰追踪招聘进展。
  - **紧急提醒**：临近任务伴有呼吸灯动画效果。
- **💎 精致 UI**：全动态玻璃拟态设计，支持背景模糊、丝滑缩放动画。
- **⚙️ 稳定可靠**：使用 IMAP UID 追踪，防止重复抓取；内置单实例运行锁。

## 🛠️ 技术栈

- **后端**: Python 3.9+
- **前端**: HTML5, CSS3 (Vanilla), JavaScript (ES6+)
- **引擎**: `pywebview`
- **AI**: DeepSeek / OpenAI API
- **邮件**: IMAPlib (针对 QQ 邮箱优化)

## 📂 项目结构

```text
拉取招聘信息/
├── core/
│   └── backend.py      # 核心逻辑：邮件拉取、AI 解析
├── web/
│   ├── index.html      # UI 结构
│   ├── style.css       # 跨平台适配样式与动画
│   └── app.js          # 前端交互逻辑
├── main.py             # 程序入口，支持平台自动判定
├── config.json         # 配置文件 (邮箱、API Key 等)
├── requirements.txt    # 跨平台依赖清单
├── start_windows.bat   # [NEW] Windows 一键启动脚本
├── toggle.sh           # macOS 快捷开关脚本
└── 招聘助手开关.app      # macOS 原生启动器
```

## 🚀 快速开始

### 1. 配置信息
在 `config.json` 中填写你的邮箱授权码和 AI API Key（建议使用 DeepSeek，物美价廉）。

### 2. 运行程序（全自动化）

无论你使用什么系统，我们都提供了**一键环境配置与启动**脚本：

#### 🍎 macOS 用户
直接运行项目目录下的 **`toggle.sh`**：
```bash
./toggle.sh
```
*脚本会自动检查并配置 `venv` 环境、安装缺失依赖，并在后台静默启动助手。*

#### 🪟 Windows 用户
直接双击运行项目根目录下的 **`start_windows.bat`**。
*脚本会自动创建虚拟环境、安装依赖并启动程序，无需手动输入命令。*

## 📝 常见问题

- **关于路径**：项目已实现路径规范化，无论在 Mac 还是 Windows 下均能正确读写配置。
- **关于权限**：QQ 邮箱需在“设置-账户”中开启 IMAP 服务并获取 16 位授权码。
- **关于 UI**：若在 Windows 下发现文字模糊，请检查显卡驱动是否支持硬件加速。

## 📜 许可证

[MIT License](LICENSE)
