# System Architecture

> 本文档为系统架构索引，详细内容已拆分到各子文档。

## 快速导航

### 核心架构
- [Overview](./system/overview.md) - 系统架构概述、技术栈
- [Data Flow](./system/data-flow.md) - 数据流设计与业务流程
- [Security Architecture](./system/security-architecture.md) - 安全架构（JWT 认证、权限控制）

### 部署与扩展
- [Deployment](./system/deployment.md) - 部署架构
- [Scalability](./system/scalability.md) - 扩展性设计

## 系统特点

### 架构原则
- **前后端分离**：Next.js + FastAPI
- **异步优先**：全面使用 async/await
- **类型安全**：TypeScript + Python Type Hints
- **安全第一**：JWT 认证 + 数据隔离
- **可扩展**：模块化设计，易于扩展

### 核心能力
- **对话式交互**：多轮对话需求采集
- **多模态处理**：PDF/Word/PPT/视频解析
- **RAG 检索**：语义检索增强生成
- **课件生成**：自动生成 PPT 和教案
- **预览修改**：可视化预览和对话式修改

## 技术栈

| 层级 | 技术选型 | 用途 |
|------|---------|------|
| 前端 | Next.js 15 + TypeScript | Web 应用 |
| 后端 | FastAPI + Python 3.11 | REST API |
| 数据库 | SQLite → PostgreSQL | 元数据存储 |
| 向量库 | ChromaDB | RAG 检索 |
| LLM | DashScope (Qwen 3.5) | AI 能力 |
| 文档解析 | LlamaParse | 文档处理 |
| 视频理解 | Qwen-VL API | 视频处理 |
