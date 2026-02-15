# 技术栈

## 已确定

### 前端
- Next.js 15 (App Router) - React框架，SSR + 流式渲染
- TypeScript - 类型安全
- Tailwind CSS + Shadcn/ui - UI框架
- Framer Motion - 动画

### 后端
- FastAPI + Python 3.11 - 异步Web框架
- Pydantic v2 - 数据验证
- Prisma ORM - 数据库操作
- SQLite - 轻量级数据库（初期）

### 工具
- Git + GitHub - 版本控制
- ESLint + Prettier - 前端格式化
- Black - Python格式化

## 待调研（成员D负责）

### AI核心技术
- 大语言模型: GPT-4 / Claude / 开源模型
- 向量数据库: ChromaDB / Pinecone / Qdrant
- Embedding: OpenAI / BGE / M3E

### 多模态处理
- 文档解析: LlamaParse / PyMuPDF / Unstructured
- 视频处理: OpenCV / FFmpeg
- 图片OCR: Tesseract / PaddleOCR

### 课件生成
- PPT: python-pptx
- Word: python-docx

## 技术选型理由

### Next.js 15
- 服务端组件 + 流式渲染适合AI场景
- 性能优秀，开发体验好

### FastAPI
- Python生态丰富，AI库支持好
- 异步高性能，自动生成API文档

### SQLite
- 零配置，开发简单
- 后期可迁移到PostgreSQL

## 风险

- SQLite并发限制 → 初期够用，后期迁移
- AI技术待确定 → 成员D调研测试

---

详细决策见：[技术决策记录](../03-ARCHITECTURE/tech-decisions.md)
