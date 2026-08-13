# CecilioBot

**纯对话式 AI 工作流编排工具** —— 用自然语言指挥多个 AI Agent 协作完成复杂任务。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Windows](https://img.shields.io/badge/Platform-Windows-0078d7?logo=windows)](https://github.com)
[![Electron](https://img.shields.io/badge/Electron-47848f?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org/)

---

## 📖 简介

ceciliobot 是一个桌面应用，让你通过**自然对话**来编排多个 AI Agent 协同工作。不需要写代码、不需要配置复杂的工作流——只需要像和人说话一样描述你的需求，剩下的交给 AI 自动完成。

**核心思想**：你说任务，AI 自动拆解、调度、执行、交付结果。

---

## ✨ 核心功能

| 功能 | 说明 |
|------|------|
| 💬 **纯对话交互** | 像 ChatGPT 一样自然对话，但背后是多 Agent 协作 |
| 🧠 **自定义角色** | 任意添加、编辑、删除 AI 角色，每个角色独立设置提示词和模型 |
| 🤖 **多模型支持** | 内置 qwen，支持添加 OpenAI、DeepSeek 等任意兼容模型 |
| 🔗 **协作工作流** | 选择多个角色，按顺序自动接力完成任务 |
| 🌙 **暗色/亮色模式** | 一键切换，纯黑暗色护眼 |
| 🚀 **一键安装** | 首次启动自动安装核心框架，无需手动配置 |
| 🔑 **序列号激活** | 简单输入序列号即可激活，无复杂技术术语 |

---

## 🖥️ 界面预览

> *（请替换为实际截图）*

| 亮色模式 | 暗色模式 |
|----------|----------|
| ![亮色模式](screenshots/light.png) | ![暗色模式](screenshots/dark.png) |

---

## 🚀 快速开始

### 下载安装

从 [Releases](https://github.com/yourusername/ceciliobot/releases) 下载最新版本：

- `ceciliobot Setup x.x.x.exe` — 安装版（推荐）
- `ceciliobot x.x.x.exe` — 便携版（免安装）

### 首次使用

1. 双击运行 `ceciliobot.exe`
2. 如果提示安装核心框架，点击「开始安装」（自动静默安装，约 1-2 分钟）
3. 输入序列号（Token）激活
4. 在「角色管理」中添加自定义角色或使用默认角色
5. 选择参与协作的角色，输入任务，发送

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/yourusername/ceciliobot.git
cd ceciliobot

# 安装依赖
npm install
cd frontend && npm install && cd ..

# 开发模式
npm run electron:dev

# 打包 Windows 安装包
npm run build:win
