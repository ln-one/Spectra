# Project-Space API 草案

> 日期：2026-03-09
> 目标：在既有 `/projects` 主干上，为“课程空间 / 学习空间 / 引用 / 协作审核 / 按需外化”提供一套可扩展、可渐进落地的接口草案。
> 前提：现有 `/projects`、`/files`、`/generate`、`/preview`、`/rag` 已存在，`session-first` 目标接口将完成。
> 说明：除特殊说明外，本文中的路径均为完整的 `/api/v1/*` 路径。

## 1. 设计原则

本草案遵循以下原则：

1. 保持 `/projects` 作为主资源入口。
2. 通过子资源扩展能力，而不是推翻既有接口。
3. 明确区分“正式状态”和“工作过程”。
4. 明确区分“读取教师空间”和“创建自己的学习空间”。
5. 先做可实现的最小接口，再为后续复杂协作留扩展位。

## 2. 资源模型总览

建议 API 资源分为六类：

1. `projects`
2. `generation-sessions`
3. `references`
4. `versions`
5. `artifacts`
6. `candidate-changes`

关系如下：

- `project` 是主资源
- `generation-session` 是 `project` 下的生成工作会话
- `reference` 是 `project` 对其他 `project` 的引用关系
- `version` 是 `project` 的正式状态记录
- `artifact` 是从 `project` 或 `generation-session` 派生出的结果
- `candidate-change` 是协作者提交的候选变更

## 3. 建议保留的现有接口

以下现有接口建议保留，并逐步补强字段：

### 3.1 项目

- `POST /api/v1/projects`
- `GET /api/v1/projects`
- `GET /api/v1/projects/{project_id}`
- `PUT /api/v1/projects/{project_id}`
- `DELETE /api/v1/projects/{project_id}`

### 3.2 文件

- `POST /api/v1/files`
- `POST /api/v1/files/batch`
- `PATCH /api/v1/files/{file_id}/intent`
- `DELETE /api/v1/files/{file_id}`

### 3.3 生成

- `POST /api/v1/generate/courseware`
- `GET /api/v1/generate/tasks/{task_id}/status`
- `GET /api/v1/generate/tasks/{task_id}/versions`
- `GET /api/v1/generate/tasks/{task_id}/download`

### 3.4 预览

- `GET /api/v1/preview/{task_or_project_id}`
- `POST /api/v1/preview/{task_or_project_id}/modify`
- `GET /api/v1/preview/{task_or_project_id}/slides/{slide_id}`
- `POST /api/v1/preview/{task_or_project_id}/export`

说明：

1. 这些接口可继续承担兼容层职责。
2. 新功能应优先围绕 `project + generation-session` 的现有主语义补接口。
3. 旧接口内部可逐步适配到新的资源模型。

## 4. 项目接口扩展

## 4.1 获取项目详情

### `GET /api/v1/projects/{project_id}`

建议扩展返回字段：

```json
{
  "project": {
    "id": "proj_xxx",
    "name": "高中物理·牛顿第二定律",
    "kind": "course",
    "status": "active",
    "current_version_id": "ver_xxx",
    "source_project_id": null,
    "default_reference_mode": "none",
    "visibility": "private",
    "is_referenceable": false
  }
}
```

### `PUT /api/v1/projects/{project_id}`

建议支持补充字段：

- `kind`
- `visibility`
- `is_referenceable`
- `default_reference_mode`

注意：

1. `source_project_id` 不建议通过普通更新接口直接修改。
2. 来源关系应通过 `references` 子资源维护。

## 4.2 从已有项目创建新项目

### `POST /api/v1/projects`

建议扩展入参：

```json
{
  "name": "我的牛顿第二定律学习空间",
  "description": "学生个人复习空间",
  "kind": "study",
  "base_project_id": "proj_teacher_xxx",
  "reference_mode": "follow"
}
```

规则：

1. 若未传 `base_project_id`，则创建原生项目。
2. 若传了 `base_project_id`，后端自动创建一条主基底引用。
3. `reference_mode` 仅允许 `follow` 或 `pinned`。

## 5. Generation Session 接口

当前仓库已经通过 `session-first` 契约引入了 `GenerationSession`，因此这里直接沿用 `/api/v1/generate/sessions*` 作为会话主链路，而不再并行设计另一套 `/projects/{project_id}/sessions` 语义。

## 5.1 创建会话

### `POST /api/v1/generate/sessions`

用途：

1. 教师开启新的生成工作流
2. 协作者开启自己的工作会话
3. 学生开启个人临时生成会话

请求示例：

```json
{
  "project_id": "proj_xxx",
  "title": "第一次生成会话",
  "purpose": "authoring",
  "base_version_id": "ver_xxx"
}
```

响应示例：

```json
{
  "session": {
    "id": "sess_xxx",
    "project_id": "proj_xxx",
    "title": "第一次生成会话",
    "purpose": "authoring",
    "status": "active",
    "base_version_id": "ver_xxx"
  }
}
```

说明：

1. `project_id` 继续作为生成会话的归属边界。
2. `purpose`、`base_version_id` 属于下一阶段建议补强字段。

## 5.2 会话列表

### `GET /api/v1/generate/sessions?project_id={project_id}`

支持过滤：

- `status`
- `purpose`
- `owner_user_id`

## 5.3 获取单个会话

### `GET /api/v1/generate/sessions/{session_id}`

返回：

1. 会话基本信息
2. 当前草稿状态
3. `base_version_id`
4. 最近导出物摘要

## 5.4 会话级预览与导出

建议与现有规划保持一致：

- `GET /api/v1/generate/sessions/{session_id}/preview`
- `POST /api/v1/generate/sessions/{session_id}/preview/modify`
- `GET /api/v1/generate/sessions/{session_id}/preview/slides/{slide_id}`
- `POST /api/v1/generate/sessions/{session_id}/preview/export`

扩展建议：

1. 返回 `based_on_version_id`
2. 返回 `artifact_id`
3. 冲突时统一返回 `409`

## 6. Reference 接口

## 6.1 创建引用

### `POST /api/v1/projects/{project_id}/references`

用途：

1. 添加主基底引用
2. 添加辅助引用

请求示例：

```json
{
  "target_project_id": "proj_base_xxx",
  "relation_type": "base",
  "mode": "follow",
  "pinned_version_id": null,
  "priority": 0
}
```

校验规则：

1. `relation_type=base` 时，一个项目最多一条有效记录。
2. `mode=pinned` 时，`pinned_version_id` 必填。
3. 创建前必须做 DAG 校验。
4. 必须校验被引用项目是否 `is_referenceable=true`。

## 6.2 获取引用列表

### `GET /api/v1/projects/{project_id}/references`

返回：

1. 主基底引用
2. 辅助引用
3. 每条引用的模式、优先级、状态

## 6.3 更新引用

### `PATCH /api/v1/projects/{project_id}/references/{reference_id}`

允许更新：

- `mode`
- `pinned_version_id`
- `priority`
- `status`

不允许直接修改：

- `project_id`
- `target_project_id`

如需变更目标，建议删除后重建。

## 6.4 删除引用

### `DELETE /api/v1/projects/{project_id}/references/{reference_id}`

注意：

1. 若删除的是主基底引用，需要重新校验项目状态。
2. 若该引用仍被候选变更或会话草稿依赖，应给出阻止或警告。

## 7. Version 接口

## 7.1 项目版本列表

### `GET /api/v1/projects/{project_id}/versions`

返回：

1. `version_id`
2. `parent_version_id`
3. `summary`
4. `change_type`
5. `created_by`
6. `created_at`

## 7.2 获取单个版本

### `GET /api/v1/projects/{project_id}/versions/{version_id}`

返回：

1. 版本元信息
2. 结构化状态摘要
3. 来源引用摘要

说明：

1. 先返回摘要，不强制暴露完整 diff。
2. 后续若需要对比功能，再补更细接口。

## 8. Artifact 接口

## 8.1 项目导出物列表

### `GET /api/v1/projects/{project_id}/artifacts`

支持过滤：

- `type`
- `visibility`
- `owner_user_id`
- `based_on_version_id`

## 8.2 获取单个导出物

### `GET /api/v1/projects/{project_id}/artifacts/{artifact_id}`

返回：

1. `type`
2. `storage_path`
3. `based_on_version_id`
4. `session_id`
5. `owner_user_id`
6. `visibility`

## 8.3 创建临时按需结果

### `POST /api/v1/projects/{project_id}/artifacts`

用途：

1. 学生不创建自己的学习空间时，按需生成导图/摘要/练习
2. 教师在当前项目中生成额外结果

请求示例：

```json
{
  "session_id": "sess_xxx",
  "type": "mindmap",
  "based_on_version_id": "ver_xxx",
  "visibility": "private"
}
```

说明：

1. 这类接口适合轻量按需生成。
2. 若用户需要长期整理，应引导其创建自己的项目空间。

## 9. Candidate Change 接口

## 9.1 提交候选变更

### `POST /api/v1/projects/{project_id}/candidate-changes`

请求示例：

```json
{
  "session_id": "sess_xxx",
  "base_version_id": "ver_xxx",
  "title": "补充实验案例并调整顺序",
  "summary": "增加小车实验案例，前置变量控制法说明",
  "payload": {}
}
```

说明：

1. `payload` 初期可以是轻量 JSON 摘要。
2. 后续可演进为结构化补丁。

## 9.2 候选变更列表

### `GET /api/v1/projects/{project_id}/candidate-changes`

支持过滤：

- `status`
- `proposer_user_id`
- `session_id`

## 9.3 审核候选变更

### `POST /api/v1/projects/{project_id}/candidate-changes/{change_id}/review`

请求示例：

```json
{
  "action": "accept",
  "review_comment": "同意合入，保留案例顺序调整"
}
```

规则：

1. `accept` 后写入新的正式版本。
2. `reject` 保留候选变更记录，不改正式状态。
3. 若 `base_version_id` 已过期且不能自动重放，应返回 `409`。

## 10. 分享与权限接口建议

若后续要正式支持“只读访问、不污染教师空间”，建议新增：

### `GET /api/v1/projects/{project_id}/members`
### `POST /api/v1/projects/{project_id}/members`
### `PATCH /api/v1/projects/{project_id}/members/{member_id}`

能力位建议拆成：

- `can_view`
- `can_reference`
- `can_collaborate`
- `can_manage`

这比只靠角色更可控。

## 11. 错误语义建议

统一建议：

- `400` 参数非法
- `403` 无权限
- `404` 资源不存在
- `409` 版本冲突 / DAG 冲突 / 状态不允许
- `422` 业务校验失败

典型 `409` 场景：

1. 创建引用后会形成循环依赖
2. 候选变更基于过期版本无法直接合入
3. `pinned` 模式缺少固定版本号

## 12. 渐进落地顺序

### Phase 1

先补：

1. `/api/v1/generate/sessions` 的 `project_id` 查询扩展
2. `/projects/{id}/versions`
3. `/projects/{id}/artifacts`

### Phase 2

再补：

1. `/projects/{id}/references`
2. 跟随 / 固定引用
3. DAG 校验

### Phase 3

最后补：

1. `/projects/{id}/candidate-changes`
2. 审核合入
3. 细粒度成员权限

## 13. 结论

最稳的 API 演进路线，不是发明一套全新资源体系，而是在既有 `/projects` 主干上补齐：

1. `generation-sessions`
2. `references`
3. `versions`
4. `artifacts`
5. `candidate-changes`

这样可以同时满足：

1. 当前比赛叙事
2. 现有工程兼容
3. 后续平台化扩展
