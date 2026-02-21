# Technology Stack

## Overview

本文档说明 Spectra 项目的技术选型及理由，所有技术选型基于竞赛时间限制（一个月）、团队规模（4人）和演示需求。

## Frontend Stack

### Core Framework

**Next.js 15**
- **选型理由**：
  - 现有脚手架已使用，无需重新搭建
  - App Router 支持服务端渲染和客户端渲染
  - 内置路由、API Routes、图片优化等功能
  - 开发体验好，热更新快
- **使用方式**：
  - App Router 管理页面路由
  - Server Components 优化首屏加载
  - Client Components 处理交互逻辑
- **版本**：15.5.10

**TypeScript**
- **选型理由**：
  - 类型安全，减少运行时错误
  - IDE 支持好，开发效率高
  - 团队熟悉，学习成本低
- **使用方式**：
  - 严格模式（strict: true）
  - 定义 Props 和 State 类型
  - API 响应类型定义
- **版本**：5.x

### UI Framework

**Tailwind CSS**
- **选型理由**：
  - 现有脚手架已配置
  - 原子化 CSS，开发速度快
  - 响应式设计简单
  - 文件体积小（按需打包）
- **使用方式**：
  - 使用 Tailwind 类名编写样式
  - 自定义主题色和间距
  - 响应式断点：sm/md/lg/xl
- **版本**：3.4.1

**Shadcn/ui**
- **选型理由**：
  - 现有脚手架已集成
  - 基于 Radix UI，无障碍性好
  - 组件可定制，代码可控
  - 与 Tailwind 完美集成
- **使用方式**：
  - 使用现有组件：Button, Card, Dialog, Progress 等
  - 自定义主题和样式
  - 扩展组件功能
- **版本**：最新

**Framer Motion**
- **选型理由**：
  - 动画库，提升用户体验
  - API 简单，易于使用
  - 支持手势和拖拽
- **使用方式**：
  - 页面切换动画
  - 组件出现动画
  - 加载状态动画
- **版本**：12.x

### State Management

**React Context**
- **选型理由**：
  - React 内置，无需额外依赖
  - 适合中小型应用
  - 学习成本低
- **使用方式**：
  - ProjectContext: 当前项目信息
  - ChatContext: 对话历史
  - UploadContext: 文件列表
  - GenerationContext: 生成任务状态
- **备选方案**：Zustand（如果状态管理复杂）

### HTTP Client

**Fetch API**
- **选型理由**：
  - 浏览器原生支持
  - 无需额外依赖
  - 支持 async/await
- **使用方式**：
  - 封装 API 调用函数（lib/api.ts）
  - 统一错误处理
  - 请求拦截和响应拦截
- **备选方案**：axios（如果需要更多功能）

### Form Handling

**React Hook Form**
- **选型理由**：
  - 现有脚手架已安装
  - 性能好，减少重渲染
  - 与 Zod 集成好
- **使用方式**：
  - 表单验证
  - 错误提示
  - 提交处理
- **版本**：7.x

**Zod**
- **选型理由**：
  - TypeScript-first 验证库
  - 类型推导自动
  - 与 React Hook Form 集成
- **使用方式**：
  - 定义表单 Schema
  - 验证用户输入
  - 生成 TypeScript 类型
- **版本**：4.x

## Backend Stack

### Core Framework

**FastAPI**
- **选型理由**：
  - 现有脚手架已使用
  - 性能好，基于 Starlette 和 Pydantic
  - 自动生成 OpenAPI 文档
  - 支持异步（async/await）
  - Python 生态丰富
- **使用方式**：
  - 定义 Router 处理 API 请求
  - Pydantic 模型验证请求
  - BackgroundTasks 处理异步任务
  - Dependency Injection 管理依赖
- **版本**：0.109.1

**Python**
- **选型理由**：
  - AI 生态最丰富
  - 团队熟悉
  - 库支持好
- **版本**：3.11

**Uvicorn**
- **选型理由**：
  - ASGI 服务器，性能好
  - 支持热重载
  - 与 FastAPI 配合好
- **使用方式**：
  - 开发环境：uvicorn main:app --reload
  - 生产环境：gunicorn + uvicorn workers
- **版本**：0.27.0

### ORM

**Prisma**
- **选型理由**：
  - 现有脚手架已使用
  - 类型安全，自动生成 Python 客户端
  - 支持 SQLite 和 PostgreSQL
  - Migration 管理方便
- **使用方式**：
  - 定义 Schema（schema.prisma）
  - 生成客户端（prisma generate）
  - 执行迁移（prisma migrate）
  - 异步查询（asyncio）
- **版本**：0.11.0

### Validation

**Pydantic v2**
- **选型理由**：
  - FastAPI 内置
  - 类型验证和序列化
  - 性能好（v2 使用 Rust）
- **使用方式**：
  - 定义请求/响应 Schema
  - 自动验证和转换
  - 生成 JSON Schema
- **版本**：2.5.3

## AI Services

### LLM

**DashScope API (Qwen 3.5)**
- **选型理由**：
  - 阿里云通义千问，中文能力强
  - API 稳定，价格便宜
  - 支持流式响应
  - 支持 Function Calling
- **使用方式**：
  - 对话理解和意图提取
  - 内容生成和改写
  - 教学法推荐
- **配置**：
  - API Key: 环境变量 DASHSCOPE_API_KEY
  - 模型：qwen-plus / qwen-turbo
- **文档**：https://help.aliyun.com/zh/dashscope/

**LiteLLM**
- **选型理由**：
  - 统一 LLM 接口，支持多个提供商
  - 简化 API 调用
  - 支持 fallback 和重试
- **使用方式**：
  - 封装 DashScope API 调用
  - 统一错误处理
  - 支持切换模型
- **版本**：1.61.15

### Document Parsing

**LlamaParse**
- **选型理由**：
  - 云端解析服务，无需本地部署
  - 支持 PDF/Word/PPT
  - 结构化提取能力强
  - 快速跑通 MVP
- **使用方式**：
  - 上传文件到 LlamaParse API
  - 获取解析结果（Markdown/JSON）
  - 提取标题、段落、公式、图表
- **配置**：
  - API Key: 环境变量 LLAMA_CLOUD_API_KEY
- **文档**：https://docs.llamaindex.ai/en/stable/llama_cloud/llama_parse/
- **备选方案**：MinerU（本地部署，P1 阶段）

### Video Understanding

**Qwen-VL API**
- **选型理由**：
  - 阿里云视觉理解模型
  - 支持视频关键帧提取
  - 支持场景理解和描述
  - 与 Qwen 3.5 配套
- **使用方式**：
  - 上传视频或关键帧
  - 获取场景描述
  - 提取时间轴信息
- **配置**：
  - 使用 DashScope API Key
  - 模型：qwen-vl-plus
- **备选方案**：GPT-4V（如果 Qwen-VL 效果不好）

### Embedding

**DashScope Embedding API**
- **选型理由**：
  - 与 Qwen 配套
  - 中文效果好
  - API 调用简单
- **使用方式**：
  - 文本向量化
  - 语义检索
- **配置**：
  - 使用 DashScope API Key
  - 模型：text-embedding-v2
- **备选方案**：sentence-transformers（本地部署）

### Vector Database

**ChromaDB**
- **选型理由**：
  - 轻量级，本地部署
  - Python 原生支持
  - 适合 MVP 快速开发
  - 支持按 metadata 过滤
- **使用方式**：
  - 创建 Collection（按 project_id）
  - 添加文档和向量
  - 语义检索（similarity search）
  - 按 project_id 过滤
- **版本**：0.4.22
- **数据存储**：backend/chroma_data
- **备选方案**：Milvus / Qdrant（生产环境）

### Courseware Generation

**Marp**
- **选型理由**：
  - Markdown to PPT
  - 简单易用
  - 支持主题定制
  - 输出标准 PPTX 格式
- **使用方式**：
  - 生成 Markdown 内容
  - 调用 Marp CLI 转换
  - 输出 .pptx 文件
- **安装**：npm install -g @marp-team/marp-cli
- **文档**：https://marp.app/

**Pandoc**
- **选型理由**：
  - 文档格式转换工具
  - 支持 Markdown to Word
  - 支持模板定制
- **使用方式**：
  - 生成 Markdown 内容
  - 调用 Pandoc 转换
  - 输出 .docx 文件
- **安装**：系统包管理器安装
- **文档**：https://pandoc.org/

### Speech Recognition (P1)

**Faster-Whisper**
- **选型理由**：
  - 本地部署，隐私保护
  - 速度快（优化版 Whisper）
  - 中文支持好
- **使用方式**：
  - 接收音频流
  - 转写为文本
  - 术语纠错
- **备选方案**：DashScope ASR API（云端）

## Database

### Relational Database

**SQLite**
- **选型理由**：
  - 轻量级，无需独立服务
  - 适合开发和演示
  - Prisma 支持好
  - 迁移到 PostgreSQL 简单
- **使用方式**：
  - 存储项目元数据
  - 存储对话历史
  - 存储文件信息
  - 存储生成任务
- **数据文件**：backend/prisma/dev.db
- **迁移方案**：
  - 生产环境切换到 PostgreSQL
  - 修改 DATABASE_URL
  - 执行 prisma migrate

**PostgreSQL (生产环境)**
- **选型理由**：
  - 功能强大
  - 支持并发
  - 支持 JSON 类型
- **使用场景**：生产环境部署

## Development Tools

### Testing

**pytest (Backend)**
- **选型理由**：
  - Python 标准测试框架
  - 插件丰富
  - 异步测试支持
- **使用方式**：
  - 单元测试（Service 层）
  - 集成测试（API 层）
  - Fixture 管理测试数据

**Jest (Frontend)**
- **选型理由**：
  - 现有脚手架已配置
  - React 测试支持好
  - 快照测试
- **使用方式**：
  - 组件测试
  - Hook 测试
  - 工具函数测试

### Code Quality

**ESLint (Frontend)**
- **选型理由**：
  - 现有脚手架已配置
  - 代码规范检查
  - 自动修复
- **配置**：Next.js 推荐配置

**Flake8 (Backend)**
- **选型理由**：
  - 现有脚手架已配置
  - Python 代码规范检查
  - PEP 8 标准
- **配置**：.flake8

**Prettier (Frontend)**
- **选型理由**：
  - 现有脚手架已配置
  - 代码格式化
  - 统一代码风格
- **配置**：.prettierrc

### Version Control

**Git + GitHub**
- **选型理由**：
  - 团队协作
  - 代码版本管理
  - CI/CD 集成
- **工作流**：
  - main 分支保护
  - feature 分支开发
  - PR review

**Husky**
- **选型理由**：
  - 现有脚手架已配置
  - Git hooks 管理
  - 提交前检查
- **使用方式**：
  - pre-commit: 代码检查和格式化
  - commit-msg: 提交信息规范

## Deployment

### Containerization

**Docker**
- **选型理由**：
  - 环境一致性
  - 部署简单
  - 支持多平台
- **使用方式**：
  - Dockerfile.dev（开发环境）
  - docker-compose.yml（本地开发）
  - 生产环境镜像

### Web Server

**Nginx**
- **选型理由**：
  - 高性能
  - 反向代理
  - 静态文件服务
- **使用场景**：演示环境和生产环境

## Environment Variables

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend (.env)

```bash
DATABASE_URL="file:./prisma/dev.db"
DASHSCOPE_API_KEY=your_api_key
LLAMA_CLOUD_API_KEY=your_api_key
```

## Technology Decision Records

### 为什么选择 Next.js 而不是 Vite + React？

- 现有脚手架已使用 Next.js
- SSR 支持更好
- 路由和 API Routes 内置
- 学习成本低（团队熟悉）

### 为什么选择 FastAPI 而不是 Django？

- 性能更好（异步支持）
- API 开发更快
- 自动生成文档
- 与 AI 库集成更好

### 为什么选择 Prisma 而不是 SQLAlchemy？

- 类型安全更好
- Migration 管理更简单
- 与 TypeScript 风格一致
- 现有脚手架已使用

### 为什么选择 LlamaParse 而不是 MinerU？

- 云端服务，无需本地部署
- 快速跑通 MVP
- 后续可切换到 MinerU（P1）

### 为什么选择 ChromaDB 而不是 Milvus？

- 轻量级，本地部署
- 适合 MVP 开发
- 后续可迁移到 Milvus（生产环境）

### 为什么选择 SQLite 而不是 PostgreSQL？

- 开发和演示阶段够用
- 无需独立服务
- 迁移到 PostgreSQL 简单
- 降低部署复杂度

## Summary

本技术栈的核心原则：
1. **基于现有脚手架**：减少搭建时间
2. **快速开发**：优先选择简单易用的技术
3. **可扩展**：预留生产环境迁移方案
4. **成本可控**：优先使用免费或低成本服务
5. **团队熟悉**：避免引入不熟悉的技术
