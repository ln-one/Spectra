# 技术栈

## 架构分层总览

| 架构层 | 核心技术 | 关键特性 | 选型理由 |
|--------|----------|----------|----------|
| **表现层** | Next.js 15 (App Router) | SSR、流式渲染、文件系统路由 | React Server Components 优化首屏，适配 AI 生成代码 |
| **视觉交互** | Tailwind CSS + Shadcn/ui | 原子化 CSS、无头组件 | 消灭样式冲突，AI 编程助手友好 |
| **动效引擎** | Framer Motion | 物理建模动画、声明式转换 | 原生 App 级交互体验 |
| **业务逻辑** | FastAPI | 异步非阻塞、类型提示、ASGI | 支持长连接与流式 API，高并发响应 |
| **数据校验** | Pydantic v2 | 强类型校验、自动文档 | 前后端契约层，防范 AI 幻觉 |
| **AI 路由** | LiteLLM | 多模型路由、标准化输出 | 模型不可知架构，灵活切换 |
| **多模态解析** | MinerU / LlamaParse | 版面分析、结构化 Markdown | 解决 PDF 解析痛点 |
| **知识检索** | ChromaDB | 嵌入式向量存储、ANN | 满足"本地知识库"要求 |
| **数据持久化** | Prisma | 声明式 Schema、类型安全 | 领域模型驱动，自动迁移 |
| **成果生成** | Marp + Pandoc | Markdown → PPT/Word | AI 友好，排版 100% 稳定 |

---

## 已确定

### 前端
- **Next.js 15** (App Router) - React框架，SSR + 流式渲染
- **TypeScript** - 类型安全
- **Tailwind CSS + Shadcn/ui** - UI框架（Apple 风格极简设计）
- **Framer Motion** - 物理感动画引擎

### 后端
- **FastAPI + Python 3.11** - 异步Web框架
- **Pydantic v2** - 数据验证（契约层）
- **Prisma ORM** - 数据库操作
- **SQLite** - 轻量级数据库（初期，后续可迁移 PostgreSQL）

### AI 核心 ✅ 已确定
- **Qwen 3.5** - 主控大脑 LLM（中文教学语境最强，性价比高）
- **LiteLLM** - 多模型路由（不使用 LangChain）
- **Qwen 3 Embedding** - 向量嵌入模型
- **ChromaDB** - 向量数据库（轻量快速，适合初期开发与 Demo）

### 多模态处理 ✅ 已确定
- **MinerU (Magic-PDF)** - PDF/Word/PPT 文档结构化解析（主选，本地部署）
- **LlamaParse** - 文档解析（备选，云端 API）
- **PaddleOCR** - 图片文字识别
- **Faster-Whisper** - 语音转文字（本地化部署）
- **OpenCV** - 视频关键帧提取

### 课件生成 ✅ 已确定
- **Marp** - Markdown → PPT/HTML5（逻辑即排版，风格统一）
- **Pandoc** - Markdown → Word（万能文档转换器）

### RAG 增强 ✅ 已确定
- **BGE-Reranker** - 检索结果重排序
- **BM25 + Vector Search** - 混合检索策略

### 工具
- Git + GitHub - 版本控制
- ESLint + Prettier - 前端格式化
- Black + Ruff - Python 格式化与 Lint

---

## 关键选型决策

### ✅ 采用 LiteLLM，不使用 LangChain
- LangChain 过度抽象，学习曲线陡峭
- LiteLLM 已解决多模型路由问题
- 手写 Prompt 链路更可控、更易调试
- 详见：[ADR-008](../decisions/008-llm-routing.md)

### ✅ 采用 Marp，而非 python-pptx
- AI 输出 Markdown 比复杂 API 调用简单
- 排版 100% 稳定，无坐标计算
- 支持自定义 CSS 教学主题
- 详见：[ADR-007](../decisions/007-courseware-generation.md)

### ✅ MinerU + LlamaParse 可插拔
- MinerU：本地部署，满足赛题要求，公式识别强
- LlamaParse：云端 API，快速原型开发
- 通过配置切换，兼顾开发效率与演示需求
- 详见：[ADR-005](../decisions/005-document-parsing.md)

---

## 技术选型理由

### Qwen 3.5 (阿里通义千问)
- 中文教学术语理解极准，逻辑推理能力强
- API 价格约为 GPT 的 1/10，性价比最高
- 响应迅速，支持多模态扩展
- 详见：[ADR-004](../decisions/004-llm-selection.md)

### MinerU (Magic-PDF)
- 教材 PDF 公式识别率极高
- 能保留 LaTeX 公式、表格、目录结构
- 可本地部署，无 API 费用
- 详见：[ADR-005](../decisions/005-document-parsing.md)

### ChromaDB
- 极简轻量，几行代码即可集成
- 检索延迟约 100ms，满足教学场景
- 适合快速迭代和 Demo 演示
- 详见：[ADR-006](../decisions/006-vector-database.md)

### Marp + Pandoc
- 告别繁琐的 PPT 坐标计算
- 通过 Markdown 实现"逻辑即排版"
- 支持自定义 CSS 教学主题
- 详见：[ADR-007](../decisions/007-courseware-generation.md)

### Next.js 15
- 服务端组件 + 流式渲染适合 AI 场景
- 性能优秀，开发体验好
- 详见：[ADR-001](../decisions/001-frontend-framework.md)

### FastAPI
- Python 生态丰富，AI 库支持好
- 异步高性能，自动生成 API 文档
- 详见：[ADR-002](../decisions/002-backend-framework.md)

### SQLite
- 零配置，开发简单
- 后期可迁移到 PostgreSQL
- 详见：[ADR-003](../decisions/003-database.md)

---

## 技术架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js 15)                  │
│        TypeScript + Tailwind CSS + Shadcn/ui                │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API
┌─────────────────────────▼───────────────────────────────────┐
│                      Backend (FastAPI)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Chat/对话    │  │  Upload/上传 │  │  Generate/生成   │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                    │             │
│  ┌──────▼─────────────────▼────────────────────▼─────────┐  │
│  │                   AI Service Layer                     │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐  │  │
│  │  │ Qwen3.5 │  │ MinerU  │  │ChromaDB │  │Marp/Pandoc│ │  │
│  │  │  (LLM)  │  │(Parser) │  │  (RAG)  │  │(Generator)│  │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └──────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Storage Layer                            │
│     SQLite (元数据)    │    文件系统 (上传/生成产物)          │
└─────────────────────────────────────────────────────────────┘
```

---

## 风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| SQLite 并发限制 | 高并发下延迟上升 | 初期够用，I4-I5 预留 PostgreSQL 迁移窗口 |
| MinerU GPU 资源需求 | 部署成本增加 | 可选 CPU 模式，或使用云 GPU |
| Qwen API 稳定性 | 生成中断 | 设置重试机制，备选 GPT-4 |
| ChromaDB 数据规模上限 | 大规模知识库受限 | 后期可迁移至 Milvus |

---

## 参考文档

- [技术调研报告](../requirements/ai/2.tech-research.md)
- [知识库规划](../requirements/ai/3.knowledge-base.md)
- [Prompt 设计](../requirements/ai/4.prompt-design.md)
- [技术决策记录](../decisions/)
