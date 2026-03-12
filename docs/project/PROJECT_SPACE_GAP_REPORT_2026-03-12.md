# Project-Space 目标契约差距清单（2026-03-12）

> 范围：对比 `docs/openapi-target-source.yaml`（目标契约）与当前后端实现。
> 目的：为下一阶段排期与分工提供清晰落点（契约优先）。

## 1. 总览结论

- **已实现主干**：`/projects`、`/files`、`/generate/sessions*`、`/preview*`、`/chat*`、`/rag*`。
- **目标契约新增**：`references / versions / artifacts / candidate-changes / members` 子资源。
- **现状差距**：新增子资源均未实现；预览/导出返回字段需要补齐；项目创建/更新扩展字段需要补齐。

## 2. 目标接口差距列表

### 2.1 Project 扩展字段（target）

- **接口**：`POST /api/v1/projects`、`PUT /api/v1/projects/{project_id}`、`GET /api/v1/projects/{project_id}`
- **目标新增字段**：
  - `base_project_id`、`reference_mode`
  - `visibility`、`is_referenceable`
  - `current_version_id`
- **当前状态**：未实现
- **备注**：
  - 新建时若 `base_project_id` 存在，需要自动建立主基底引用。

### 2.2 Project References

- **接口**：
  - `POST /api/v1/projects/{project_id}/references`
  - `GET /api/v1/projects/{project_id}/references`
  - `PATCH /api/v1/projects/{project_id}/references/{reference_id}`
  - `DELETE /api/v1/projects/{project_id}/references/{reference_id}`
- **当前状态**：未实现
- **关键约束**：
  - 主基底唯一、`follow/pinned`、DAG 校验、`is_referenceable` 检查。

### 2.3 Project Versions

- **接口**：
  - `GET /api/v1/projects/{project_id}/versions`
  - `GET /api/v1/projects/{project_id}/versions/{version_id}`
- **当前状态**：未实现
- **备注**：
  - 版本为正式状态锚点，与 `Artifact`、`Reference` 绑定。

### 2.4 Project Artifacts

- **接口**：
  - `GET /api/v1/projects/{project_id}/artifacts`
  - `GET /api/v1/projects/{project_id}/artifacts/{artifact_id}`
  - `POST /api/v1/projects/{project_id}/artifacts`
- **当前状态**：未实现
- **备注**：
  - 轻量成果入口（mindmap/summary/exercise）与 session 主生成链路区分。

### 2.5 Candidate Changes

- **接口**：
  - `POST /api/v1/projects/{project_id}/candidate-changes`
  - `GET /api/v1/projects/{project_id}/candidate-changes`
  - `POST /api/v1/projects/{project_id}/candidate-changes/{change_id}/review`
- **当前状态**：未实现
- **备注**：
  - `accept` 写入新版本；过期版本需返回 `409`。

### 2.6 Project Members（Phase 3）

- **接口**：
  - `GET /api/v1/projects/{project_id}/members`
  - `POST /api/v1/projects/{project_id}/members`
  - `PATCH /api/v1/projects/{project_id}/members/{member_id}`
- **当前状态**：未实现
- **备注**：
  - 权限位：`can_view / can_reference / can_collaborate / can_manage`。

## 3. 预览/导出补齐项（session-first）

- **接口**：`GET /preview`、`POST /preview/modify`、`POST /preview/export`
- **目标新增字段**：
  - `artifact_id`
  - `based_on_version_id`
- **当前状态**：未实现（仅契约已补齐）
- **备注**：
  - 支持通过 `artifact_id` 指定预览/修改/导出目标。

## 4. 实现建议拆分

1. **Phase 1（基础落地）**：`versions` + `artifacts` + project 扩展字段
2. **Phase 2（引用链）**：`references` + DAG 校验
3. **Phase 3（协作与审核）**：`candidate-changes` + `members`

## 5. 关联文档

- `docs/project/PROJECT_SPACE_API_DRAFT_2026-03-09.md`
- `docs/project/PROJECT_SPACE_DATA_MODEL_DRAFT_2026-03-09.md`
- `docs/openapi-target-source.yaml`
