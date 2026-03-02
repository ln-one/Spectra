# 技术决策记录（ADR）

> 更新时间：2026-03-02
> 说明：ADR 记录“为什么这么选”，不等于“已经全部落地”。

## 1. 决策索引

### 基础架构
- [001 - 前端框架选择：Next.js 15](./001-frontend-framework.md)
- [002 - 后端框架选择：FastAPI](./002-backend-framework.md)
- [003 - 数据库选择：SQLite](./003-database.md)

### AI 与生成
- [004 - 大语言模型选择：Qwen 3.5](./004-llm-selection.md)
- [005 - 文档解析方案：MinerU + LlamaParse](./005-document-parsing.md)
- [006 - 向量数据库选择：ChromaDB](./006-vector-database.md)
- [007 - 课件生成方案：Marp + Pandoc](./007-courseware-generation.md)
- [008 - LLM 路由策略：LiteLLM（不使用 LangChain）](./008-llm-routing.md)

## 2. 决策与落地状态

| 决策主题 | ADR 结论 | 当前落地状态 |
|---|---|---|
| 前端框架 | Next.js 15 + TypeScript | 已落地 |
| 后端框架 | FastAPI + Pydantic | 已落地 |
| 数据访问 | Prisma Client Python | 已落地 |
| 向量库 | ChromaDB | 已落地 |
| LLM 路由 | LiteLLM | 已落地 |
| 课件导出 | Marp + Pandoc | 已落地 |
| 文档解析 | MinerU/LlamaParse 可插拔 | 规划中（当前为本地轻量解析） |
| 语音/视频能力 | Faster-Whisper / Qwen-VL 等 | 规划中 |

## 3. 使用方式

- 讨论“为什么选型”：看 ADR。
- 确认“现在代码用了什么”：看 [技术栈（MVP 对齐版）](../architecture/tech-stack.md)。
