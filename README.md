# 🚀 AI Recruitment Assistant (招聘助手)

一个专为 macOS 设计的桌面挂件式招聘信息聚合工具。它能够自动从你的 QQ 邮箱中拉取招聘相关的邮件，利用 AI 技术进行深度解析，并将面试、笔试、测评等任务以优雅的玻璃拟态 (Glassmorphism) UI 展示在桌面上。

![Demo](https://via.placeholder.com/350x600/2c3e50/ffffff?text=Recruitment+Assistant+UI)

## ✨ 核心特性

- **🤖 智能 AI 解析**：基于 DeepSeek/OpenAI API，能够自动识别邮件意图，提取公司名、时间、任务类型（线上面试、线下面试、AI面试、笔试、测评等）。
- **🌈 动态任务分类**：
  - 自动识别并总结非标准任务（如：资料补充、Offer发放、入职通知）。
  - 不同类型的任务拥有独特的视觉标签和配色方案。
- **📦 任务管理系统**：
  - **待处理列表**：实时展示最新的招聘动态。
  - **历史记录**：已完成的任务自动归档，支持折叠/展开。
  - **紧急提醒**：临近或高优任务带有呼吸灯动画提醒。
- **💎 极致视觉体验**：
  - 原生 macOS 挂件行为：隐藏 Dock 图标、固定桌面层级、不参与 Cmd+Tab 切换。
  - 玻璃拟态 UI 设计，支持模糊背景和透明窗口。
  - 丝滑的折叠与缩放动画效果。
- **⚙️ 稳定可靠**：
  - 使用 **IMAP UID** 模式追踪邮件，完美解决 ID 偏移和重复抓取问题。
  - 智能单实例运行锁，防止程序重复开启。
  - 自动静默后台运行。

## 🛠️ 技术栈

- **Backend**: Python 3.9+
- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (ES6+)
- **Engine**: `pywebview` (macOS Native WebKit)
- **AI**: DeepSeek / OpenAI Chat Completions API
- **Mail**: IMAPlib (QQ Mail Optimized)

## 📂 项目结构

```text
拉取招聘信息/
├── core/
│   └── backend.py      # 核心逻辑：邮件拉取、AI 解析、数据持久化
├── web/
│   ├── index.html      # UI 结构
│   ├── style.css       # 玻璃拟态样式与动画
│   └── app.js          # 前端交互逻辑
├── main.py             # 程序入口，负责窗口创建与 macOS 原生特性设置
├── config.json         # 配置文件 (邮箱、API Key、刷新频率)
├── tasks.json          # 本地任务数据库 (自动生成)
├── fetch.log           # 详细运行与 Debug 日志 (自动生成)
├── toggle.sh           # 快捷启动/关闭脚本
└── 招聘助手开关.app      # macOS 原生启动器快捷方式
```

## 🚀 快速开始

### 1. 环境准备
确保你的环境中已安装 Python 3.9+。建议在虚拟环境中安装依赖：
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install pywebview openai beautifulsoup4
```

### 2. 配置说明
在 `config.json` 中填写你的配置信息：
```json
{
    "email": "your_email@qq.com",
    "auth_code": "your_imap_auth_code",
    "check_interval": 60,
    "ai_config": {
        "use_ai": true,
        "provider": "openai",
        "api_key": "your_deepseek_api_key",
        "api_base": "https://api.deepseek.com/v1",
        "model": "deepseek-chat"
    }
}
```
> **注意**：QQ 邮箱需要先在设置中开启 IMAP 服务并获取“授权码”。

### 3. 运行程序
- **开发模式**: 直接运行 `python3 main.py`。
- **后台挂机**: 运行 `./toggle.sh` 即可一键开启/关闭助手，并伴有系统通知提醒。

## 📝 调试与维护

- **日志查看**：所有抓取详情（包括邮件正文摘要和 AI 响应原文）均记录在 `fetch.log` 中。
- **数据管理**：若需重置任务，可删除 `tasks.json`。
- **UID 模式**：程序会自动记住已读取邮件的 UID，确保即使标记为未读也不会重复弹窗。

## 📜 许可证

[MIT License](LICENSE)
