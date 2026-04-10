# Service Layer Design

> 状态说明（2026-03-02）：本页仅列当前代码中存在的服务。

## 设计原则

- 业务逻辑集中在 `services/`，Router 只做协议层处理。
- IO 场景统一用 async/await。
- 外部依赖调用失败时提供可控回退，不在 Router 层吞异常。

## 当前服务清单

| Service | 文件 | 作用 | 状态 |
|---|---|---|---|
| `DatabaseService` | `database.py` | Prisma 数据读写 | 已实现 |
| `AuthService` | `auth_service.py` | 注册、登录、Token 相关 | 已实现 |
| `AIService` | `ai.py` | LLM 调用与意图分类 | 已实现 |
| `EmbeddingService` | `embedding_service.py` | 向量化 provider 适配 | 已实现 |
| `RAGService` | `rag_service.py` | `Stratumind` consumer façade、reference merge、source detail | 已实现 |
| `File Parser` | `file_parser.py` | PDF/Word/PPT 轻量解析 | 已实现 |
| `Generation` | `generation/*` | Marp/Pandoc 导出 | 已实现 |

## 规划中的能力

- 可插拔解析器（MinerU/LlamaParse）。
- 视频理解与语音识别能力。

## 与 Router 的边界

- Router：参数校验、权限检查、HTTP 响应码。
- Service：业务编排、外部调用、异常语义化。

## 状态转换校验（新增约束）

- 所有会修改生成会话状态的动作，统一由 Service 层的 `StateTransitionGuard` 校验。
- Router 不直接判断状态跳转是否合法，只负责把 Command 转交 Service。
- 若违反状态机规则，Service 返回统一冲突语义（`409` + `INVALID_STATE_TRANSITION`）。
