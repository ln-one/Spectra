# 技术决策记录 (ADR)

> Architecture Decision Records

## 已记录的决策

### 基础架构
- [001 - 前端框架选择：Next.js 15](./001-frontend-framework.md) ✅
- [002 - 后端框架选择：FastAPI](./002-backend-framework.md) ✅
- [003 - 数据库选择：SQLite](./003-database.md) ✅

### AI 技术选型
- [004 - 大语言模型选择：Qwen 3.5](./004-llm-selection.md) ✅
- [005 - 文档解析方案：MinerU + LlamaParse](./005-document-parsing.md) ✅
- [006 - 向量数据库选择：ChromaDB](./006-vector-database.md) ✅
- [007 - 课件生成方案：Marp + Pandoc](./007-courseware-generation.md) ✅
- [008 - LLM 路由策略：LiteLLM（不使用 LangChain）](./008-llm-routing.md) ✅

## 技术栈总览

| 架构层 | 技术选型 | 备选方案 | 状态 |
|--------|----------|----------|------|
| 表现层 | Next.js 15 + TypeScript | - | ✅ 已确定 |
| 视觉交互 | Tailwind CSS + Shadcn/ui | - | ✅ 已确定 |
| 动效引擎 | Framer Motion | - | ✅ 已确定 |
| 业务逻辑 | FastAPI + Python 3.11 | - | ✅ 已确定 |
| 数据校验 | Pydantic v2 | - | ✅ 已确定 |
| 数据持久化 | Prisma + SQLite | → PostgreSQL | ✅ 已确定 |
| LLM | Qwen 3.5 | GPT-4 (fallback) | ✅ 已确定 |
| LLM 路由 | LiteLLM | ~~LangChain~~ | ✅ 已确定 |
| 文档解析 | MinerU (主) | LlamaParse (备) | ✅ 已确定 |
| 向量数据库 | ChromaDB | → Milvus | ✅ 已确定 |
| Embedding | Qwen 3 Embedding | - | ✅ 已确定 |
| 课件生成 | Marp + Pandoc | ~~python-pptx~~ | ✅ 已确定 |
| 语音识别 | Faster-Whisper | - | ✅ 已确定 |
| 图片 OCR | PaddleOCR | - | ✅ 已确定 |
| 视频处理 | OpenCV | - | ✅ 已确定 |
| 检索重排 | BGE-Reranker | - | ✅ 已确定 |

## 关键决策说明

### 为什么不使用 LangChain？
- 过度抽象，学习曲线陡峭
- LiteLLM 已解决多模型路由问题
- 手写 Prompt 链路更可控
- 详见：[ADR-008](./008-llm-routing.md)

### 为什么用 Marp 而非 python-pptx？
- AI 输出 Markdown 比复杂 API 调用简单
- 排版 100% 稳定，无坐标计算烦恼
- 详见：[ADR-007](./007-courseware-generation.md)

### MinerU vs LlamaParse？
- 两者都支持，可插拔设计
- MinerU：本地部署，满足赛题要求
- LlamaParse：云端 API，快速原型
- 详见：[ADR-005](./005-document-parsing.md)

## ADR 格式

每个决策包含：
- 标题和编号
- 状态（提议/已接受/已废弃）
- 背景和问题
- 考虑的方案
- 决策结果
- 理由和权衡

