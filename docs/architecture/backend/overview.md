# Backend Architecture Overview
<!-- REVIEW #B9 (P1): “相关文档”区块中的 schema-layer.md / ai-integration.md / testing.md / deployment.md 当前不存在，建议修复链接或补齐文档。 -->

## 概述

Spectra 后端基于 **FastAPI + Python 3.11 + Prisma ORM** 构建，采用分层架构设计，支持对话交互、文件处理、RAG 检索、课件生成等核心功能。

## 架构原则

- **分层清晰**：Router → Service → Data 三层分离
- **异步优先**：所有 IO 操作使用 async/await
- **类型安全**：全面使用 Type Hints 和 Pydantic v2
- **可扩展**：服务层模块化，易于添加新功能
- **可测试**：依赖注入，便于单元测试

## 技术栈

| 组件 | 技术选型 | 用途 |
|------|---------|------|
| Web 框架 | FastAPI | REST API 服务 |
| 语言 | Python 3.11 | 异步支持、类型提示 |
| ORM | Prisma | 数据库操作 |
| 数据验证 | Pydantic v2 | 请求/响应模型 |
| 数据库 | SQLite → PostgreSQL | 开发/生产环境 |
| 向量数据库 | ChromaDB | RAG 检索 |
| LLM 接口 | LiteLLM | 统一 LLM 调用 |
| 文档解析 | LlamaParse | PDF/Word/PPT 解析 |
| 视频理解 | Qwen-VL API | 关键帧提取 |
| 课件生成 | Marp CLI + Pandoc | PPT/Word 生成 |

## 目录结构

```
backend/
├── main.py                 # FastAPI 应用入口
├── routers/                # API 路由层
├── services/               # 业务逻辑层
├── schemas/                # Pydantic 数据模型
├── utils/                  # 工具函数
├── prisma/                 # 数据库
├── uploads/                # 上传文件存储
├── chroma_data/            # ChromaDB 数据
├── requirements.txt        # 依赖列表
├── requirements-dev.txt    # 开发依赖
└── pytest.ini              # 测试配置
```

## 架构分层

```mermaid
graph TB
    A[Router Layer] --> B[Service Layer]
    B --> C[Data Layer]
    B --> D[External Services]
    D --> E[LiteLLM]
    D --> F[ChromaDB]
    D --> G[LlamaParse]
```

## 相关文档

- [Router Layer](./router-layer.md) - API 路由设计
- [Service Layer](./service-layer.md) - 业务逻辑设计
- [Schema Layer](./schema-layer.md) - 数据模型设计
- [AI Integration](./ai-integration.md) - AI 能力集成
- [Authentication](./authentication.md) - 认证服务
- [Security](./security.md) - 安全设计
- [Error Handling](./error-handling.md) - 错误处理
- [Logging](./logging.md) - 日志设计
- [Testing](./testing.md) - 测试策略
- [Deployment](./deployment.md) - 部署指南
