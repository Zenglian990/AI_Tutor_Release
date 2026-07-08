<div align="center">

# 🎓 EduAgent : AI Tutor for K-9 Education

**An Open-Source, RAG-Powered AI Tutoring System specifically designed for K-9 Students**

[![React](https://img.shields.io/badge/Frontend-React-blue?style=flat-square&logo=react)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/RAG-Python-yellow?style=flat-square&logo=python)](https://python.org/)
[![Database](https://img.shields.io/badge/Vector_DB-LanceDB-orange?style=flat-square)](https://lancedb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](https://opensource.org/licenses/MIT)

[**中文版**](README.md) | [**English**](README_en.md)

*"Education equality is not just a slogan. We aim to bring top-tier AI private tutors to every ordinary household."*

</div>

---

## 📸 UI Showcase

<div align="center">
  <img src="docs/assets/ui-main.png" alt="UI Main" width="800"/>
  <br/>
  <img src="docs/assets/ui-settings.png" alt="UI Settings" width="800"/>
  <br/>
  <img src="docs/assets/ui-levels.png" alt="UI Levels" width="800"/>
</div>

---


## English Version

### 🎯 Overview
**EduAgent** is an open-source, RAG-powered AI tutoring system specifically designed for K-9 students. Utilizing Google's Gemini models and LanceDB, it provides an adaptive, localized, and interactive educational experience.

"Education equality is not just a slogan. We aim to bring top-tier AI private tutors to every ordinary household."

### 🌟 Features

EduAgent abandons the traditional "give the answer directly" model. Instead, it builds a true **guided agent** based on LLMs (Gemini) and precise vector databases (RAG):

- 🧠 **Dual-Modal Teaching Engine**:
  - **Grades 1-3 (Playful Mode)**: Lively language, encouraging tone, and metaphors to protect children's interest in learning.
  - **Grades 4-9 (Logical Mode)**: Focuses on mind maps, logical deduction, and closed-loop mistake tracking.
- 📚 **Precise RAG Knowledge Base**: Deeply integrates official K-9 textbook PDFs. All AI answers prioritize citing original textbook text, eliminating LLM "hallucinations".
- 🗣️ **Socratic Method**: It never gives the final answer immediately when encountering difficult problems. Instead, it guides the child to solve the problem independently through heuristic questioning (e.g., "What do you think we should calculate first?").
- 📷 **Multi-modal Problem Search**: Supports uploading photos of homework. The AI automatically performs OCR parsing and provides step-by-step guidance.
- 📒 **Smart Mistake Notebook**: Automatically tracks and records knowledge points where the child frequently makes mistakes, and supports one-click generation of variation exercise sheets.

### 🛠️ Tech Stack

```mermaid
graph TD
    A[React Client] -->|API Requests| B(Node.js Server)
    B -->|Query & Context| C{Gemini LLM}
    B -->|Search| D[(LanceDB Vector DB)]
    D -->|Ingest| E[Python RAG Scripts]
    E -->|Parse| F[1-9 Grade Textbooks PDF]
```

### 🚀 Quick Start

Thanks to our highly automated startup scripts, you **DO NOT** need to manually configure complex Node.js or Python dependencies.

#### 1. Clone the repository
```bash
git clone https://github.com/Zenglian990/AI_Tutor_Release.git
cd AI_Tutor_Release
```

#### 2. One-Click Start (Fully Automated)
- **Windows**: Double-click to run `启动AI辅导.bat`
- **Mac/Linux**: Run `sh start.sh` in your terminal

> **🪄 Magic Experience**: The script will automatically check your Node.js environment, **download all backend/frontend dependencies, and build the React frontend automatically**.
> On first run, it will **automatically prompt** you to enter your `Gemini API Key` (get one for free at Google AI Studio), and then start the server directly!

The system will automatically open the main interface at `http://localhost:3001`.

#### 3. About the Knowledge Base (RAG)
> **🎁 Out-of-the-box**: This release includes approximately 90MB of pre-built vector data for K-9 textbooks. You can skip any Python configurations and start asking questions immediately!

(If you need to incrementally update PDFs for other grades using Python later, please refer to `scripts/ingest_2_0.py` and `requirements.txt`).

## 🤝 Contributing
We highly welcome contributions from community members! Whether you are a developer, an educator, or a parent, you are welcome to submit Pull Requests or open Issues. Let's work together to polish this tool and benefit more ordinary families.

---
*Built with ❤️ by 曾练 (Zeng Lian) & the Open Source Community*
