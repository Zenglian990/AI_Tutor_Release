# 曾练专属私教 (AI Tutor Release v1.0)

基于人教版 1-9 年级教材的智能辅导系统，专为1-9年级学生定制。

## 🌟 核心功能
- **双模式教学**：1-3年级（活泼鼓励型） vs 4-9（严谨逻辑型）。
- **RAG 知识库**：深度集成人教版教材，所有回答优先引用课本原话。
- **苏格拉底模式**：启发式提问，引导学生自主思考而非直接给答案。
- **多模态搜题**：支持拍照上传题目，AI 自动解析。
- **错题笔记本**：自动识别疑惑点并收录，支持“举一反三”变式练习。

## 🚀 快速开始

### 1. 环境准备
确保您的电脑已安装以下软件：
- **Node.js** (v18 或更高)
- **Python** (3.8 - 3.11)

### 2. 安装依赖
在项目根目录下打开终端，运行：
```bash
# 安装后端依赖
npm install

# 安装 Python 依赖 (用于更新知识库)
pip install -r requirements.txt

# 安装前端依赖 (仅需一次)
cd client
npm install
npm run build
cd ..
```

### 3. 配置环境 (关键)
1. 将 `.env.example` 重命名为 `.env`。
2. 编辑 `.env` 文件：
   - `GEMINI_API_KEY`: 填入您的 Google API Key (建议配置多个以增加频率上限)。
   - `PROXY_URL`: 如果您在中国大陆使用，请填入代理地址 (如 `http://127.0.0.1:7897`)。

### 4. 初始化/更新知识库
**本发行版已内置了约 90MB 的人教版教材向量数据，您可以直接启动使用。**
若要加载更多教材或更新数据：
1. 将 PDF 教材放入 `data/textbooks/`。
2. 运行：
```bash
# 下载教材 (可选)
python download_textbooks.py

# 导入并建立向量索引
python ingest_2_0.py
```

### 5. 启动服务
- **Windows**: 双击运行 `启动AI辅导.bat`。
- **macOS/Linux**: 运行 `sh start.sh`。
- **通用**: 在终端运行 `npm start`。

服务启动后会自动打开浏览器访问 `http://localhost:3001`。

## ⚠️ 重要说明
1. **安全性**：切勿将包含真实 API Key 的 `.env` 文件分享给他人。
2. **额度限制**：免费版 API 每天有 4000 次请求限制。若额度耗尽，请更换 Key 或等待次日刷新。
3. **跨平台支持**：本系统支持 Windows, macOS 和 Linux。

## 📁 目录结构
- `server/`: 后端核心逻辑与 API（模块化架构，入口为 `server/index.js`）。
- `client/`: React 前端源码。
- `data/`: 存储 SQLite 错题本、LanceDB 向量库及教材文件。
- `tests/`: 自动化测试脚本。

---
*祝孩子们学习进步！*
