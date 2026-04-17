# 后端开发规范（简版）

> 更新时间：2026-04-16
> 目标：给出当前后端可直接执行的最小约束。

## 1. 架构约束

- 分层：`router -> application service -> domain/data`
- `router` 只负责：鉴权、参数解析、调用 service、响应返回
- `router` 不写复杂业务编排，不直接承载多步流程状态判断
- `service` 负责：业务编排、异常语义化、外部调用、跨模块流程组织
- 数据访问统一走数据库/存储相关 service，不在 `router` 中直接拼底层调用

## 2. 文件与模块组织

- 优先使用 `folder-as-module`
- 单文件 `>300` 行：进入复查区，确认是否仍为单一职责
- 单文件 `>500` 行：默认应拆分
- 单文件 `>800` 行：列为优先重构项
- 当一个领域开始包含多个职责时，优先拆成目录模块，而不是继续在根目录平铺 `*_service.py`

### 推荐目录粒度

- 路由：`backend/routers/<domain>/`
- 应用编排：`backend/services/<group>/<domain>/` 或 `backend/services/<domain>/`
- Schema：`backend/schemas/*.py`
- 工具/依赖：`backend/utils/*.py`
- 测试：`backend/tests/**`

## 3. 当前推荐的顶层分区

### workflow shell

面向 Session、事件、任务和 API 聚合：

- `generation_session_service/`
- `preview_helpers/`
- `task_queue/`
- `task_executor/`
- `application/project_api.py`
- `application/file_management.py`

### external capability adapters

面向六个正式能力源的显式 client/facade：

- `diego_client.py`
- `render_engine_adapter.py`
- `ourograph_client.py`
- `platform/dualweave_client.py`
- `stratumind_client.py`
- `platform/limora_client.py`
- `project_space_service/` 仅作为 Ourograph facade

### local support

面向模型调用、提示词、运行时状态、非正式文件辅助：

- `ai/`
- `prompt_service/`
- `database/`
- `media/`
- `rag_api_service/`
- `artifact_generator/` 仅保留非 Office 文件 helper

## 4. 依赖边界

- 新生产代码禁止默认使用 `from services import xxx`
- 优先显式导入，例如 `from services.media.audio import transcribe_audio`
- `services/__init__.py` 仅保留兼容出口，不作为新增代码默认入口
- 测试中若为了 patch 历史兼容路径，可保留少量兼容导入
- 微服务能力边界以 [service-boundaries.md](/Users/ln1/Projects/Spectra/docs/architecture/service-boundaries.md) 为准；backend 新代码默认只能做编排、聚合、状态与契约，不应复制 `diego / pagevra / ourograph / dualweave / stratumind / limora` 的正式产品语义
- backend-local Marp/Pandoc/PPTX/DOCX 生成不得重新成为生产主链；课件主生成归 Diego，渲染外化归 Pagevra
- `project_space_service` 名称可短期保留，但只能是 Ourograph consumer facade

## 5. 数据与安全

- 所有用户资源接口必须鉴权
- 查询项目/文件/任务时必须带用户边界检查
- 资源边界统一规则：资源不属于当前用户时返回 `403`
- 幂等接口需要支持 `Idempotency-Key`

## 6. 架构守门

执行：

```bash
python3 backend/scripts/architecture_guard.py
```

当前规则：

- `>300` 行：warning
- `>500` 行：error
- `>800` 行：critical
- 新增根目录平铺 `*_service.py`：warning
- 生产代码新增 `from services import ...`：error

说明：`300` 不是硬性一刀切阈值，而是提示需要复查单一职责。

## 7. 提交前检查

```bash
cd backend
black .
isort .
flake8 .
pytest
python3 scripts/architecture_guard.py
```
