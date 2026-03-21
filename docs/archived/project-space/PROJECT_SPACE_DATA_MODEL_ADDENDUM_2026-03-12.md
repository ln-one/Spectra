# Project-Space 数据模型补充草案（2026-03-12）

> 目的：基于 2026-03-09 模型草案，补充后端最小可落地的数据模型与字段建议。
> 原则：不推翻现有主干；仅增量扩展。

## 1. 现有主干（保持不变）

- `User`
- `Project`
- `GenerationSession`
- `GenerationTask`
- `Upload` / `ParsedChunk`
- `Conversation`
- `OutlineVersion`
- `SessionEvent`

## 2. Project 扩展字段（建议）

补充字段（与 target 契约对齐）：

- `visibility`：`private` / `shared`
- `isReferenceable`：Boolean
- `currentVersionId`：指向当前正式版本

## 3. 新增模型（最小落地版）

### 3.1 ProjectReference

```text
ProjectReference
- id
- projectId
- targetProjectId
- relationType        // base | auxiliary
- mode                // follow | pinned
- pinnedVersionId     // nullable
- priority            // int
- status              // active | disabled
- createdBy
- createdAt
- updatedAt
```

约束：
- `relationType=base` 每项目唯一
- `mode=pinned` 必须有 `pinnedVersionId`
- 创建前需 DAG 校验

### 3.2 ProjectVersion

```text
ProjectVersion
- id
- projectId
- parentVersionId     // nullable
- summary
- changeType          // author-update | merge-change | reference-change | import
- snapshotData        // JSON
- createdBy
- createdAt
```

说明：
- 只在“正式入库”时写入，不追求每次草稿变更都落版本。

### 3.3 Artifact

```text
Artifact
- id
- projectId
- sessionId           // nullable
- basedOnVersionId    // nullable
- ownerUserId         // nullable
- type                // pptx | docx | mindmap | summary | exercise | html | gif | mp4
- visibility          // private | project-visible | shared
- storagePath
- metadata            // JSON
- createdAt
- updatedAt
```

说明：
- `GenerationTask` 仍为执行记录，`Artifact` 是产出结果。

### 3.4 CandidateChange

```text
CandidateChange
- id
- projectId
- sessionId           // nullable
- baseVersionId       // nullable
- title
- summary
- payload             // JSON
- status              // pending | accepted | rejected
- proposerUserId
- createdAt
- updatedAt
```

说明：
- `accept` 后写入新 `ProjectVersion`
- 过期版本需返回冲突 `409`

### 3.5 ProjectMember

```text
ProjectMember
- id
- projectId
- userId
- role                // owner | editor | viewer
- permissions         // JSON {can_view, can_reference, can_collaborate, can_manage}
- status              // active | disabled
- createdAt
- updatedAt
```

## 4. 关系建议

- `Project` 1 -> N `ProjectReference`
- `Project` 1 -> N `ProjectVersion`
- `Project` 1 -> N `Artifact`
- `Project` 1 -> N `CandidateChange`
- `Project` 1 -> N `ProjectMember`
- `ProjectVersion` 1 -> N `Artifact`

## 5. 迁移顺序建议

1. **扩展 Project 字段**（不影响现有逻辑）
2. **ProjectVersion + Artifact**（支撑成果与锚点）
3. **ProjectReference**（引入 DAG 校验）
4. **CandidateChange + Member**（协作流程）

## 6. 关联契约

- `docs/openapi-target-source.yaml`
- `docs/project/PROJECT_SPACE_API_DRAFT_2026-03-09.md`
