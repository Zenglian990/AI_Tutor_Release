<div align="center">

# 🎓 EduAgent : AI Tutor for K-9 Education

**国内首个专为 1-9 年级量身定制的开源 RAG AI 智能教辅系统**

[![React](https://img.shields.io/badge/Frontend-React-blue?style=flat-square&logo=react)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/RAG-Python-yellow?style=flat-square&logo=python)](https://python.org/)
[![Database](https://img.shields.io/badge/Vector_DB-LanceDB-orange?style=flat-square)](https://lancedb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](https://opensource.org/licenses/MIT)

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

#### 3. 关于知识库 (RAG)

> **⚠️ 注意**：由于 GitHub 限制，本发行版不包含人教版教材向量数据。您需要自己准备 PDF 并使用 Python 脚本生成向量数据库，才能体验 AI 伴读和错题重测功能。

您可以通过以下命令生成知识库（请参考 `scripts/ingest_2_0.py` 和 `requirements.txt` 进行配置）：

## 🤝 参与贡献 (Contributing)
我们非常欢迎社区成员的参与！无论您是开发者、教育工作者还是家长，都欢迎提交 Pull Request 或提出 Issue。让我们共同把这个工具打磨得更好，惠及更多普通家庭。

---
*由曾练与开源社区倾情打造 ❤️ (Built with ❤️ by Zeng Lian & the Open Source Community)*
