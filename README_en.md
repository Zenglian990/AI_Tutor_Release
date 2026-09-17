<div align="center">

# 🎓 ZengLian AI Tutor (曾练专属私教)

**The Next-Gen Open-Source RAG AI Tutoring System specifically tailored for K-9 Education**
*Comprehensive K-9 Textbooks Knowledge Base · Dual-Modal Adaptive Mind Engines · Closed-Loop Learning System*

<br/>

[![Download APK](https://img.shields.io/badge/📱_Android_APK-v1.0.0_Download_Now-2ea44f?style=for-the-badge&logo=android)](https://github.com/Zenglian990/AI_Tutor_Release/releases/download/v1.0.0-apk/ZengLian_AI_Tutor_v1.0.0.apk)
[![Release](https://img.shields.io/github/v/release/Zenglian990/AI_Tutor_Release?style=for-the-badge&color=blue)](https://github.com/Zenglian990/AI_Tutor_Release/releases/tag/v1.0.0-apk)

<br/>

[![React](https://img.shields.io/badge/Frontend-React_18-blue?style=flat-square&logo=react)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js_Express-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Android](https://img.shields.io/badge/Mobile-Capacitor_Android-3DDC84?style=flat-square&logo=android)](https://capacitorjs.com/)
[![RAG](https://img.shields.io/badge/RAG-LanceDB_Vector-orange?style=flat-square)](https://lancedb.com/)
[![LLM](https://img.shields.io/badge/AI_Engine-Gemini_Flash-brightgreen?style=flat-square)](https://deepmind.google/technologies/gemini/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](https://opensource.org/licenses/MIT)

[**中文文档**](README.md) | [**English**](README_en.md) | [**📱 APK Download**](https://github.com/Zenglian990/AI_Tutor_Release/releases/tag/v1.0.0-apk)

> *"Education equality is not just a slogan. We aim to bring top-tier AI private tutors to every ordinary household."*

</div>

---

## 📱 Instant Experience on Android APK (Recommended)

No complex development environments required. Install the native APK directly on your phone to experience the **immersive 9:16 portrait AI Tutor**:

- **📥 Direct APK Download**: [ZengLian_AI_Tutor_v1.0.0.apk (~8.8MB)](https://github.com/Zenglian990/AI_Tutor_Release/releases/download/v1.0.0-apk/ZengLian_AI_Tutor_v1.0.0.apk)
- **🏷️ GitHub Releases**: [View Release Notes & Versions](https://github.com/Zenglian990/AI_Tutor_Release/releases/tag/v1.0.0-apk)
- **✨ Mobile Highlights**: Strict 9:16 full-screen portrait lock, edge-to-edge notch screen support, plug-and-play tutoring.

---

## 📸 UI Showcase

<div align="center">
  <h3>🖥️ 1. Modern Guided Tutoring & Concept Mind Maps</h3>
  <img src="docs/assets/ui-main.png" alt="Guided Tutoring & Main Interface" width="850"/>
  <p><i>Deep step-by-step guidance, hierarchical mind maps, instant traps & clues breakdown, live scratchpad</i></p>
  <br/>

  <h3>🗺️ 2. Interactive Gamified Learning Map</h3>
  <img src="docs/assets/ui-map.png" alt="Gamified Learning Map" width="850"/>
  <p><i>Chapter exploration islands, progressive stage unlock, turning repetitive homework into an adventure</i></p>
  <br/>

  <h3>🧭 3. Semester Roadmap & Boss Stages</h3>
  <img src="docs/assets/ui-roadmap.png" alt="Semester Roadmap" width="850"/>
  <p><i>Full semester dungeon overview with clear targets, core theorems, and rigorous geometric proof advice</i></p>
  <br/>

  <h3>📝 4. Smart Mistake Notebook & Targeted Variation Sheets</h3>
  <img src="docs/assets/ui-mistakes.png" alt="Mistake Notebook & Practice Sheets" width="850"/>
  <p><i>Ebbinghaus review schedules, one-click printable A4 layout, AI-generated variant exercises</i></p>
  <br/>

  <h3>📊 5. Parent Supervision & Weekly Learning Diagnostics</h3>
  <img src="docs/assets/ui-parent.png" alt="Parent Supervision Dashboard" width="850"/>
  <p><i>Actionable analytics, weak spot identification, customized parenting guidance, printable teacher notes</i></p>
  <br/>

  <h3>🎨 6. Social Achievement Posters for WeChat / Social Media</h3>
  <img src="docs/assets/ui-poster.png" alt="Social Achievement Poster" width="480"/>
  <p><i>High-aesthetic social poster rendering with personal QR codes and motivational quotes</i></p>
</div>

---

## 🌟 Core Features

**ZengLian AI Tutor** eliminates the drawbacks of traditional "homework search engines" that encourage rote copying. Utilizing large language models and LanceDB textbook vector knowledge bases, it establishes a true **"Learn - Practice - Test - Guide - Manage" closed-loop tutoring agent**:

- 🧠 **Dual-Modal Teaching Engines for Grades 1-9**:
  - **Grades 1-3 (Playful Mode)**: Lively language, encouraging tone, and vivid metaphors to nurture curiosity and focus.
  - **Grades 4-9 (Logical Mode)**: Employs mind maps, multi-step derivation scaffolding, and rigorous counter-questioning.
- 🗣️ **Socratic Heuristic Tutoring**:
  - Guides students step-by-step rather than spoon-feeding final answers.
  - Features real-time Text-to-Speech (TTS), draft scratchpad, instant full-page correction, and trap analysis.
- 🗺️ **Gamified Knowledge Graph**:
  - Maps complete textbook curricula into explorable stages and dungeons with progressive locks.
- 📒 **Mistake Closed Loop & Targeted Variation Practice**:
  - Automatically captures flawed concepts, generates parallel variations, and exports clean A4 test papers.
- 📊 **Parent Supervision & Academic Diagnosis**:
  - Generates comprehensive weekly reports with personalized parent follow-up recommendations.
- 📱 **Cross-Platform Access**:
  - **Web Application**: Immersive desktop multi-window experience.
  - **Native Android APK**: Tailored for 9:16 portrait phones.

---

## 🛠️ Tech Stack

```mermaid
graph TD
    UserApp[📱 Native Android APK / 💻 Web Browser] -->|API Requests| Server(Node.js / Express Server)
    Server -->|Vector Search| LanceDB[(LanceDB Vector DB)]
    Server -->|Age-Adaptive Prompts| Gemini{Google Gemini LLM}
    LanceDB -->|Fast Embeddings| PythonRAG[Python RAG Multimodal Ingestion]
    PythonRAG -->|OCR & Chunking| Textbooks[1-9 Grade Textbooks Library]
```

---

## 🚀 Quick Start for PC

With our automated startup scripts, you **DO NOT** need to manually configure complicated dependencies.

### 1. Clone the repository
```bash
git clone https://github.com/Zenglian990/AI_Tutor_Release.git
cd AI_Tutor_Release
```

### 2. One-Click Start (Fully Automated)
- **Windows**: Double-click `启动AI辅导.bat`
- **Mac/Linux**: Execute `sh start.sh` in your terminal

> The script automatically installs required dependencies, builds the frontend, and prompts for your `Gemini API Key` before opening `http://localhost:3001` in your browser.

---

## 🤝 Contributing

Contributions are warmly welcomed! Whether you are a developer, an educator, or a parent, feel free to open a Pull Request or file an Issue.

---

*Built with ❤️ by Zeng Lian & the Open Source Community*
