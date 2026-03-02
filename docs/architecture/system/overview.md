# System Architecture Overview

> 状态说明（2026-03-02）：本文档含“当前实现”和“规划能力”。技术栈落地状态以 `../tech-stack.md` 为准。

## 概述

Spectra 是一个多模态 AI 互动式教学智能体，采用前后端分离架构，支持对话式交互、多模态资料处理、RAG 检索增强和课件自动生成。

## 系统架构图

```mermaid
flowchart TB
 subgraph FE["Frontend"]
 FEPages["Pages and Components"]
 FEState["State and API Client"]
 end

 subgraph BE["Backend"]
 BERouter["API Routers"]
 BEService["Service Layer"]
 BEModel["Prisma Models"]
 end

 subgraph Store["Storage"]
 DB[("SQLite")]
 VDB[("ChromaDB")]
 FS["Uploaded and Generated Files"]
 end

 subgraph Ext["External Providers"]
 LLM["DashScope via LiteLLM"]
 Parser["Parser Provider (Planned)"]
 Vision["Vision Provider (Planned)"]
 end

 FE --> BERouter
 BERouter --> BEService
 BEService --> BEModel
 BEModel --> DB
 BEService --> VDB
 BEService --> FS
 BEService --> LLM
 BEService -.-> Parser
 BEService -.-> Vision
```

## 技术栈

### 前端
- **框架**: Next.js 15 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS + Shadcn/ui
- **状态管理**: Zustand

### 后端
- **框架**: FastAPI
- **语言**: Python 3.11
- **ORM**: Prisma
- **数据库**: SQLite -> PostgreSQL
- **向量数据库**: ChromaDB

### 外部服务
- **LLM（已实现）**: DashScope (Qwen 3.5, via LiteLLM)
- **文档解析（规划中）**: MinerU / LlamaParse 可插拔
- **视频理解（规划中）**: Qwen-VL API

## 相关文档

- [Data Flow](./data-flow.md) - 数据流设计
- [Security Architecture](./security-architecture.md) - 安全架构
- [Deployment](../deployment.md) - 部署架构
