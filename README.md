<div align="center">

# 🎓 EduAgent : AI Tutor for K-9 Education

**国内首个专为 1-9 年级量身定制的开源 RAG AI 智能教辅系统**

[![React](https://img.shields.io/badge/Frontend-React-blue?style=flat-square&logo=react)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/RAG-Python-yellow?style=flat-square&logo=python)](https://python.org/)
[![Database](https://img.shields.io/badge/Vector_DB-LanceDB-orange?style=flat-square)](https://lancedb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](https://opensource.org/licenses/MIT)
[![CI Pipeline](https://github.com/Zenglian990/AI_Tutor_Release/actions/workflows/ci.yml/badge.svg)](https://github.com/Zenglian990/AI_Tutor_Release/actions)

[**中文版**](README.md) | [**English**](README_en.md)

*“教育公平从来不是一句口号。让普通家庭的孩子，也能拥有最顶尖的专属私教。”*

</div>

---

## 📸 界面预览 (UI Showcase)

<div align="center">
  <img src="docs/assets/ui-main.png" alt="主界面演示" width="800"/>
  <br/>
  <img src="docs/assets/ui-settings.png" alt="系统设置演示" width="800"/>
  <br/>
  <img src="docs/assets/ui-levels.png" alt="年级选择演示" width="800"/>
</div>

---


## 中文版

### 🎯 项目概述 (Overview)
**EduAgent** 是一款开源的、基于 RAG（检索增强生成）的 AI 辅导系统，专为 K-9（1-9年级）学生设计。利用大语言模型和 LanceDB 向量数据库，它提供了一种自适应的、本地化的和高度互动的教育体验。

“教育公平从来不是一句口号。我们致力于将顶级的 AI 私人教师带入每一个普通家庭。”

### 🌟 核心特性 (Features)

EduAgent 摒弃了传统的“直接给答案”模式，而是基于大模型（Gemini）与精准向量库（RAG）构建了真正的**引导式智能体**：

- 🧠 **双模态教学引擎**：
  - **1-3年级（童趣模式）**：语言生动活泼，多鼓励、多比喻，保护孩子学习兴趣。
  - **4-9年级（逻辑模式）**：侧重思维导图、逻辑推演与错题闭环。
- 📚 **精准 RAG 知识库**：深度集成人教版教材 PDF，所有 AI 回答强制优先引用课本原话，杜绝大模型“幻觉”。
- 🗣️ **苏格拉底提问法**：遇到难题不给最终答案，而是通过启发式提问（如“你觉得第一步应该先求什么？”）引导孩子自主解题。
- 📷 **多模态搜题**：支持直接拍照上传作业题目，AI 自动进行 OCR 解析并分步指导。
- 📒 **智能错题本**：后台自动追踪孩子反复出错的知识点并收录，支持一键生成“举一反三”变式练习卷。

### 🛠️ 技术架构 (Tech Stack)

```mermaid
graph TD
    A[React Client] -->|API Requests| B(Node.js Server)
    B -->|Query & Context| C{Gemini LLM}
    B -->|Search| D[(LanceDB Vector DB)]
    D -->|Ingest| E[Python RAG Scripts]
    E -->|Parse| F[1-9 Grade Textbooks PDF]
```

### 🚀 快速开始 (Quick Start)

得益于我们高度自动化的启动脚本，您**不需要**手动配置复杂的 Node.js 和环境依赖。

#### 1. 克隆仓库
```bash
git clone https://github.com/Zenglian990/AI_Tutor_Release.git
cd AI_Tutor_Release
```

#### 2. 一键启动 (全自动构建)
- **Windows**: 双击运行 `启动AI辅导.bat`
- **Mac/Linux**: 在终端执行 `sh start.sh`

> **🪄 魔法体验**: 脚本会自动检查您的 Node.js 环境，并**全自动下载前后端依赖、打包构建前端页面**。
> 首次启动时，终端会**自动弹窗**请求输入您的 `Gemini API Key`（去 Google AI Studio 免费申请即可），然后直接启动服务！

系统将在 `http://localhost:3001` 自动打开主界面。

#### 3. 关于知识库 (RAG 课本数据)

系统提供**极速体验**与**全量教材入库**两种灵活方式：

- **⚡ 方式一：极速体验（免配置内置 Demo 数据）**
  无需安装配置 Python 环境，直接在项目根目录终端执行：
  ```bash
  npm run seed:demo
  ```
  该命令会向本地 LanceDB 自动注入 1-9 年级经典核心章节（人教版一年级数学/语文、三年级加减口算、七年级有理数、八年级勾股定理与声现象、九年级化学等），并完成 768 维向量对齐与全文检索索引构建，瞬间体验精准教材检索！

- **📚 方式二：全量人教版教材入库（批量 PDF 提取）**
  如果您准备了 1-9 年级完整教材 PDF 文件：
  1. 安装 Python 提取依赖：
     ```bash
     pip install -r requirements.txt
     ```
  2. 将课本 PDF 放入 `data/textbooks/` 目录下（文件名格式示例：`人教版_数学_七年级上册.pdf`）。
  3. 执行多模态智能切片入库脚本：
     ```bash
     python scripts/ingest_2_0.py
     ```
  脚本支持 EasyOCR / Gemini Vision 对课本插图、复杂数学公式排版的智能识别与切片。

## 🤝 参与贡献 (Contributing)
我们非常欢迎社区成员的参与！无论您是开发者、教育工作者还是家长，都欢迎提交 Pull Request 或提出 Issue。让我们共同把这个工具打磨得更好，惠及更多普通家庭。

---
*由曾练与开源社区倾情打造 ❤️ (Built with ❤️ by Zeng Lian & the Open Source Community)*
