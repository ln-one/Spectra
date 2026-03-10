# 技术栈（MVP 对齐版）

> 更新时间：2026-03-02
> 目的：该文档只描述“当前代码已落地技术”与“已确认过渡路线”，避免把规划当成已实现。

## 1. 当前 MVP 已落地技术

| 层级 | 当前实现（MVP） | 版本/形态 | 代码依据 |
|---|---|---|---|
| 前端框架 | Next.js + React + TypeScript | Next.js 15.5.10, React 18, TS 5.x | `frontend/package.json` |
| 样式与组件 | Tailwind CSS + Radix + Shadcn 风格组件 | Tailwind 3.4.1 | `frontend/package.json`, `frontend/components/ui/` |
| 前端状态管理 | Zustand（业务状态为主） | Zustand 5.x | `frontend/stores/*.ts` |
| 前端表单校验 | React Hook Form + Zod | RHF 7.x, Zod 4.x | `frontend/app/auth/*`, `frontend/package.json` |
| 前端请求层 | Fetch API 封装 | 自研 wrapper | `frontend/lib/api/client.ts` |
| 动效 | Framer Motion（局部使用） | 12.x | `frontend/components/FileList.tsx`, `frontend/components/FileUploadDropzone.tsx` |
| 后端框架 | FastAPI + Pydantic v2 + Uvicorn | FastAPI 0.129.0, Pydantic 2.12.5 | `backend/requirements.txt`, `backend/main.py` |
| 数据库访问 | Prisma Client Python（async） | prisma 0.15.0 | `backend/prisma/schema.prisma`, `backend/services/database.py` |
| 关系型数据库 | SQLite（当前默认） | 文件库 | `backend/prisma/schema.prisma`, `backend/.env.example` |
| LLM 调用 | LiteLLM + DashScope(Qwen) | litellm 1.81.13 | `backend/services/ai.py`, `backend/requirements.txt` |
| Embedding | DashScope qwen3-vl-embedding + 本地回退 | 1536 维默认 | `backend/services/embedding_service.py` |
| 向量库 | ChromaDB（本地持久化） | embedded 模式 | `backend/services/vector_service.py` |
| 文档解析 | pypdf / python-docx / python-pptx（轻量解析） | MVP 实装 | `backend/services/file_parser.py`, `backend/requirements.txt` |
| 课件导出 | Marp CLI（PPTX）+ Pandoc（DOCX） | 外部 CLI 工具 | `backend/services/generation/marp_generator.py`, `backend/services/generation/pandoc_generator.py` |
| 测试与质量 | pytest / Jest / ESLint / Prettier / Black / isort / flake8 | 已集成 | `backend/requirements-dev.txt`, `frontend/package.json`, `backend/pyproject.toml` |

## 2. 规划与现状差异（必须明确）

| 主题      | 规划口径                     | 当前代码现状         | 结论                         |
| ------- | ------------------------ | -------------- | -------------------------- |
| 文档解析主方案 | MinerU（主）+ LlamaParse（备） | 当前未接入，使用本地轻量解析 | 规划未落地                      |
| 视频理解    | Qwen-VL                  | 当前未接入          | 规划未落地                      |
| 语音识别    | Faster-Whisper           | 当前未接入          | 规划未落地                      |
| 状态管理表述  | React Context 为主         | 实际以 Zustand 为主 | 文档需改为“Zustand 主、Context 辅” |
| 生产数据库   | PostgreSQL               | 当前默认 SQLite    | 按 MVP 合理，生产前迁移             |

## 3. 过渡路线（从 MVP 到完整技术栈）

### Phase A（低风险对齐）
- 目标：先把文档与代码完全一致。
- 动作：
 - 统一所有技术栈描述为“MVP 已实现 vs 规划”。
 - 清理过时结论（例如把未上线能力标成“已确定并落地”）。
 - 修复文档错误链接与重复入口。

### Phase B（能力补齐）
- 目标：补齐最关键 AI 能力差异。
- 动作：
 - 为 `file_parser` 增加可插拔解析器接口（Local/MinerU/LlamaParse）。
 - 增加解析策略开关（环境变量），默认仍保留本地轻量方案。
 - 增加回归测试：PDF/Word/PPT 解析结果与失败回退。

### Phase C（生产化）
- 目标：非 MVP 能力与部署能力完善。
- 动作：
 - 评估接入 Qwen-VL/Faster-Whisper 的收益与成本。
 - 从 SQLite 迁移到 PostgreSQL（含迁移脚本、回滚策略、压测）。
 - 结合实际并发情况评估是否从 ChromaDB 升级到 Milvus/Qdrant。

## 4. 当前不建议立即做的改造

- 不建议在 MVP 阶段一次性引入：MinerU + Qwen-VL + Whisper + PostgreSQL 全量切换。
- 原因：联调面和回归面会急剧放大，且很多能力并非当前主流程阻塞点。

## 5. 维护规则（防止再次失真）

- 规则 1：文档中“已落地”必须有代码证据（文件路径）。
- 规则 2：每次依赖升级后，同步更新本页版本信息。
- 规则 3：规划项必须写“状态=规划中/未接入”，不得写成已实现。

## 6. 契约通信模式差异（前端导向改造背景）

| 主题 | 当前实现（MVP） | 目标形态（契约已定义） |
|---|---|---|
| 生成任务模型 | task 为主，轮询状态 | session 为主，状态机 + 事件流 |
| 实时反馈 | HTTP 轮询 | SSE 推送（可回退 JSON 轮询） |
| 人工确认断点 | 无显式契约 | `AWAITING_OUTLINE_CONFIRM` 显式建模 |
| 局部重绘 | 以整任务结果为主 | slide 级 regenerate 原子操作 |
| 断线恢复 | 能力有限 | resume + cursor 恢复 |

> 说明：该差异是 2026-03 架构调整重点，详见 `contract-first-adjustment.md`。
> sprint 口径：对 A/B/C/D 本轮会话化改造任务，右侧“目标形态”是最终结果和拆解基线；左侧“当前实现”仅用于说明现状与兼容层，不应覆盖本轮设计决策。
