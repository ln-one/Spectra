# Project-Space 最小数据模型草案

> 日期：2026-03-09
> 目标：在不推翻现有 `Project / Session / Upload / GenerationTask` 主干的前提下，补足“引用、个人学习空间、候选变更、轻量版本”所需的最小数据模型。

## 1. 设计原则

本草案遵循四个原则：

1. 不推翻现有 `Project` 主对象。
2. 优先增量扩展，而不是大规模改名。
3. 先满足产品规则，再考虑复杂版本控制。
4. 先支撑比赛叙事和下一阶段实现，不一次性做重型协作系统。

## 2. 现有主干保留

当前已有主干对象：

1. `User`
2. `Project`
3. `Conversation`
4. `Upload`
5. `ParsedChunk`
6. `GenerationTask`

这些对象继续保留，下一阶段重点是补五类对象：

1. `ProjectSession`
2. `ProjectReference`
3. `ProjectVersion`
4. `Artifact`
5. `CandidateChange`

## 3. 核心新增对象

## 3.1 ProjectSession

用途：

1. 隔离同一 `project` 下的工作上下文
2. 支撑教师多轮共创
3. 支撑协作者独立会话
4. 支撑学生个人临时生成过程

建议字段：

```text
ProjectSession
- id
- projectId
- ownerUserId
- title
- status                // active / archived / merged / closed
- purpose               // authoring / collaboration / student-study / preview
- baseVersionId
- latestDraftId
- createdAt
- updatedAt
```

说明：

1. `projectId` 仍是数据归属边界。
2. `baseVersionId` 用于标识当前会话从哪个正式状态开始工作。
3. `purpose` 只是业务辅助字段，不是权限本体。

## 3.2 ProjectReference

用途：

1. 支撑上游空间引用
2. 支撑 `follow / pinned`
3. 支撑主基底引用与辅助引用
4. 支撑多引用冲突优先级

建议字段：

```text
ProjectReference
- id
- projectId                 // 当前项目
- targetProjectId           // 被引用项目
- relationType              // base / auxiliary
- mode                      // follow / pinned
- pinnedVersionId           // mode=pinned 时使用
- priority                  // 辅助引用顺序
- status                    // active / disabled
- createdBy
- createdAt
- updatedAt
```

规则：

1. 每个项目最多一个 `relationType=base`
2. 可有多个 `relationType=auxiliary`
3. 引用关系必须经过 DAG 校验

## 3.3 ProjectVersion

用途：

1. 记录正式项目状态
2. 给导出物标记来源
3. 支撑 `follow / pinned`
4. 支撑“上游已更新”提醒

建议字段：

```text
ProjectVersion
- id
- projectId
- parentVersionId
- summary
- changeType               // author-update / merge-change / reference-change / import
- snapshotData             // 可先用 JSON，存结构化状态摘要
- createdBy
- createdAt
```

说明：

1. 不是每次草稿变化都写一版。
2. 只有正式入库的结构化变化才写入 `ProjectVersion`。
3. `snapshotData` 可以先是轻量 JSON 摘要，不必一开始做完整 diff 系统。

## 3.4 Artifact

用途：

1. 统一表示导出物与按需生成结果
2. 记录它来自哪个项目、哪个版本、哪个会话
3. 区分正式导出与个人私有结果

建议字段：

```text
Artifact
- id
- projectId
- sessionId
- basedOnVersionId
- ownerUserId
- type                     // pptx / docx / mindmap / summary / exercise / html / gif / mp4
- visibility               // private / project-visible / shared
- storagePath
- metadata                 // JSON
- createdAt
- updatedAt
```

说明：

1. `GenerationTask` 可继续负责异步执行。
2. `Artifact` 负责长期记录生成结果归属与来源。
3. 这样可以逐步把“任务”和“结果”解耦。

## 3.5 CandidateChange

用途：

1. 支撑协作者提交候选变更
2. 支撑维护者审核合入
3. 避免协作者直接污染正式项目状态

建议字段：

```text
CandidateChange
- id
- projectId
- sessionId
- proposerUserId
- baseVersionId
- title
- summary
- payload                  // JSON，存变更建议或结构化补丁
- status                   // proposed / accepted / rejected / superseded
- reviewedBy
- reviewedAt
- reviewComment
- createdAt
- updatedAt
```

说明：

1. 初期不必做字段级 diff，可先存结构化变更摘要。
2. `accepted` 后触发正式入库，并生成新的 `ProjectVersion`。

## 4. 权限相关对象

如果后续要做更清晰的权限拆分，建议新增：

```text
ProjectMember
- id
- projectId
- userId
- role                     // owner / manager / collaborator / viewer
- canView
- canReference
- canCollaborate
- canManage
- createdAt
- updatedAt
```

说明：

1. 这样可以把“可见/可引用/可协作/可管理”拆开。
2. 角色只是默认权限模板，不应替代细粒度能力位。

## 5. 学生学习空间的最小实现

学生学习空间不需要单独建一套新对象，本质上仍然是 `Project`。

只需要给 `Project` 增补少量字段即可：

```text
Project
+ kind                     // course / study / collaboration
+ sourceProjectId          // 若是从教师空间衍生而来，可记录来源
+ defaultReferenceMode     // follow / pinned / none
+ currentVersionId
```

说明：

1. 教师课程空间和学生学习空间都是 `Project`
2. 差别主要由 `kind` 和权限决定
3. 这样复用现有模型最多，代码最稳

## 6. 现有表的最小扩展建议

### 6.1 Project

建议新增：

```text
+ kind
+ currentVersionId
+ sourceProjectId
+ visibility
+ isReferenceable
```

### 6.2 GenerationTask

建议新增：

```text
+ sessionId
+ basedOnVersionId
+ artifactId
```

### 6.3 Conversation

建议迁移为：

```text
+ sessionId
- projectId               // 可保留兼容一段时间，再逐步迁移
```

## 7. 典型查询怎么落

## 7.1 学生查看教师空间

查询：

1. 找到教师 `project`
2. 校验 `ProjectMember.canView`
3. 读取 `currentVersionId`
4. 基于当前版本按需生成 `Artifact`

## 7.2 学生创建自己的学习空间

写入：

1. 新建一个 `Project(kind=study)`
2. 新增一条 `ProjectReference(mode=follow, relationType=base)`
3. 初始化一个 `ProjectSession`

## 7.3 协作者提交修改

写入：

1. 协作者在自己的 `ProjectSession` 中生成结果
2. 保存一条 `CandidateChange`
3. 维护者审核
4. 通过后写入新的 `ProjectVersion`

## 8. 第一阶段实现建议

如果只做最小可落地版，建议按以下顺序补：

### P0

1. `ProjectSession`
2. `ProjectVersion`
3. `Artifact`

### P1

1. `ProjectReference`
2. `Project.kind`
3. `isReferenceable`

### P2

1. `CandidateChange`
2. `ProjectMember` 能力位拆分

## 9. 暂时不要做的部分

先不要做：

1. 复杂 diff 可视化
2. 任意回滚 UI
3. 自动复杂 merge
4. 多分支图可视化
5. 全量快照复制

这些都属于后期增强，不是当前最小模型的必要条件。

## 10. 结论

当前最稳的做法不是重写现有数据模型，而是在 `Project` 主干上增量补齐：

1. `ProjectSession`
2. `ProjectReference`
3. `ProjectVersion`
4. `Artifact`
5. `CandidateChange`

这样既能承接当前比赛叙事，也能为下一阶段真正实现“课程空间 / 学习空间 / 引用复用 / 协作审核”提供清晰路径。
