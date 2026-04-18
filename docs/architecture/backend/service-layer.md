# Service Layer Design

> 状态说明（2026-04-16）：本页列 Spectra backend 作为 workflow shell 的服务边界。

## 设计原则

- 业务逻辑集中在 `services/`，Router 只做协议层处理。
- IO 场景统一用 async/await。
- 外部能力调用失败时返回结构化错误，不在 Router 层吞异常。

## 当前服务清单

| Service | 文件 | 作用 | 状态 |
|---|---|---|---|
| `DatabaseService` | `database.py` | Prisma 数据读写 | 已实现 |
| `AuthService` / `IdentityService` | `auth_service.py`, `identity_service.py` | Limora consumer façade 与认证响应整形 | 已实现 |
| `AIService` | `ai.py` | LLM 调用与意图分类 | 已实现 |
| `EmbeddingService` | `embedding_service.py` | 向量化 provider 适配 | 已实现 |
| `RAGService` | `rag_service.py` | `Stratumind` consumer façade、reference merge、source detail | 已实现 |
| `File Upload Service` | `file_upload_service/*` | Dualweave upload/parse workflow consumer | 已实现 |
| `Diego Runtime` | `generation_session_service/diego_runtime*.py` | Diego run binding、事件同步、artifact 持久化 | 已实现 |
| `Render Adapter` | `render_engine_adapter.py` | Pagevra render/preview/export consumer | 已实现 |
| `ProjectSpaceService` | `project_space_service/service.py` | Ourograph façade，不承载 formal-state 真相源 | 已实现 |

## 规划中的能力

- 继续缩薄 facade，删除旧本地 formal-state / render / generation 残留。
- 将本地轻量解析限定为显式开发/诊断工具，产品主链走 Dualweave。

## 与 Router 的边界

- Router：参数校验、权限检查、HTTP 响应码。
- Service：业务编排、外部调用、异常语义化。

## 状态转换校验（新增约束）

- 所有会修改生成会话状态的动作，统一由 Service 层的 `StateTransitionGuard` 校验。
- Router 不直接判断状态跳转是否合法，只负责把 Command 转交 Service。
- 若违反状态机规则，Service 返回统一冲突语义（`409` + `INVALID_STATE_TRANSITION`）。
