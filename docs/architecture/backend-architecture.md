# Backend Architecture

> 本文档为后端架构索引，详细内容已拆分到各子文档。
<!-- REVIEW #B9 (P1): 当前索引中引用的 schema-layer.md / ai-integration.md / testing.md / deployment.md 在 docs/architecture/backend/ 下不存在，存在断链。 -->

## 快速导航

### 核心架构
- [Overview](./backend/overview.md) - 架构概述、技术栈、目录结构
- [Data Models](./backend/data-models.md) - Prisma 数据模型详解
- [Router Layer](./backend/router-layer.md) - API 路由设计
- [Service Layer](./backend/service-layer.md) - 业务逻辑设计

### 安全与认证
- [Authentication](./backend/authentication.md) - 认证服务（JWT）
- [Security](./backend/security.md) - 权限检查、幂等性、限流

### 运维与监控
- [Error Handling](./backend/error-handling.md) - 错误处理
- [Logging](./backend/logging.md) - 日志设计

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
