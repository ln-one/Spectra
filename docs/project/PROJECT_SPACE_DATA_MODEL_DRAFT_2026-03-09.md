# Project-Space 最小数据模型草案

> 日期：2026-03-09
> 目标：在不推翻现有 `Project / GenerationSession / Upload / GenerationTask` 主干的前提下，补足“库本体、引用、个人空间（学习空间为示例）、候选变更、轻量版本”所需的最小数据模型。

## 1. 设计原则

本草案遵循五个原则：

1. 不推翻现有 `Project` 主对象。
2. 优先增量扩展，而不是大规模改名。
3. 对外以“库”统一产品语义，对内保留 `Project` 实现命名。
4. 先满足产品规则，再考虑复杂版本控制。
5. 先支撑比赛叙事和下一阶段实现，不一次性做重型协作系统。

## 2. 现有主干保留

当前已有主干对象：

1. `User`
2. `Project`
3. `Conversation`
4. `Upload`
5. `ParsedChunk`
6. `GenerationTask`
7. `GenerationSession`

这些对象继续保留。下一阶段重点是扩展一类既有对象，并补四类新对象。

简单理解一下这些基础对象是什么：

- `Project`：一个“空间/库”的实现对象（对外可以叫课程空间、个人空间，学习空间为示例）。
- `GenerationSession`：一次独立的工作会话，隔离对话与草稿。
- `GenerationTask`：一次生成任务的执行记录（异步任务）。
- `Upload/ParsedChunk`：用户上传资料与解析后的知识切片。
- `Conversation`：对话记录（后续迁移为按会话归档）。

新增对象列表：

1. `GenerationSession`（扩展）
2. `ProjectReference`
3. `ProjectVersion`
4. `Artifact`
5. `CandidateChange`

## 3. 核心新增对象

### 3.1 GenerationSession（扩展）

用途（给不熟悉模型的人一条直觉）：

把一次“对话+改稿”当成一个独立盒子。多个用户可以在同一个 `Project` 下开多个盒子，彼此草稿互不污染。

1. 隔离同一 `project` 下的工作上下文
2. 支撑多轮共创
3. 支撑多成员独立会话
4. 支撑个人临时生成过程

建议字段（每个字段的意图）：

关键字段解释：

- `status`：会话是否仍在活跃或已经合并/关闭。
- `baseVersionId`：这次会话从哪个正式版本开始。若主库已前进，系统自动在最新版本上重放修改意图，生成新草稿以节省参与者时间。
- `latestDraftId`：指向最近的草稿/预览结果。
 - 草稿只保留固定份数用于回退，超过部分可清理。

```text
GenerationSession
- id
- projectId
- ownerUserId
- title
- status                // active / archived / merged / closed
- baseVersionId
- latestDraftId
- createdAt
- updatedAt
```

说明（为什么要有这些字段）：

1. `projectId` 仍是数据归属边界。
2. `baseVersionId` 用于标识当前会话从哪个正式状态开始工作。

### 3.2 ProjectReference

用途（引用关系 = “我这个空间依赖哪个上游空间”）：

直觉：这是“我从谁那里继承知识”的关系记录，不是一次性复制。

1. 支撑上游空间引用
2. 支撑 `follow / pinned`
3. 支撑主基底引用与辅助引用
4. 支撑多引用冲突优先级

建议字段（字段含义）：

关键字段解释：

- `relationType`：`base` 是主骨架，`auxiliary` 是补充来源。
- `mode`：`follow` 跟随上游最新合法状态，`pinned` 锁定某个版本。
- `pinnedVersionId`：只在 `pinned` 时使用。
- `priority`：多个辅助引用时的排序，数值越小越优先。
- `status`：临时禁用某条引用，不删除历史。

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

规则（保证引用关系可控）：

1. 每个项目最多一个 `relationType=base`
2. 可有多个 `relationType=auxiliary`
3. 引用关系必须经过 DAG 校验

### 3.3 ProjectVersion

用途（正式状态版本 = “可被引用/导出的稳定快照”）：

直觉：只有被确认“入库”的内容才形成版本，用来给引用和导出物做锚点。

1. 记录正式项目状态
2. 给导出物标记来源
3. 支撑 `follow / pinned`
4. 支撑“上游已更新”提醒

建议字段（字段含义）：

关键字段解释：

- `parentVersionId`：版本链，便于追溯变化。
- `changeType`：记录变化来源，区分人工改动、合并、引用变化等。
- `snapshotData`：先用轻量摘要，避免一次性做复杂 diff。

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

说明（为什么不是每次都写版本）：

1. 不是每次草稿变化都写一版。
2. 只有正式入库的结构化变化才写入 `ProjectVersion`。
3. `snapshotData` 可以先是轻量 JSON 摘要，不必一开始做完整 diff 系统。

### 3.4 Artifact

用途（导出物/按需生成结果的统一记录）：

直觉：任务只是“做”，`Artifact` 才是“做完的结果”。

1. 统一表示导出物与按需生成结果
2. 记录它来自哪个项目、哪个版本、哪个会话
3. 区分正式导出与个人私有结果

建议字段（字段含义）：

关键字段解释：

- `basedOnVersionId`：结果是基于哪个正式版本生成的。
- `visibility`：`private` 仅自己可见，`project-visible` 项目内可见，`shared` 对外可见。
- `metadata`：保存页面数、来源引用摘要等轻量信息。

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

说明（为什么要把任务和结果拆开）：

1. `GenerationTask` 可继续负责异步执行。
2. `Artifact` 负责长期记录生成结果归属与来源。
3. 这样可以逐步把“任务”和“结果”解耦。

### 3.5 CandidateChange

用途（多人参与场景的“候选变更”，避免直接污染正式状态）：

直觉：所有参与者的改动先进入“候选箱”，由维护者决定是否合入正式版本。

1. 支撑参与者提交候选变更
2. 支撑维护者审核合入
3. 避免参与者直接污染正式项目状态

建议字段（字段含义）：

关键字段解释：

- `baseVersionId`：基于哪个版本提出修改。
- `payload`：变更内容的结构化摘要或补丁。
- `status`：当前在提议/通过/驳回/被替代哪种状态。

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

说明（先轻量，再演进）：

1. 初期不必做字段级 diff，可先存结构化变更摘要。
2. `accepted` 后触发正式入库，并生成新的 `ProjectVersion`。

## 4. 权限相关对象

如果后续要做更清晰的权限拆分，建议新增：

```text
ProjectMember
- id
- projectId
- userId
- canView
- canReference
- canCollaborate
- canManage
- createdAt
- updatedAt
```

说明（权限能力位的含义）：

1. 这样可以把“可见/可引用/可协作/可管理”拆开。
2. 权限以能力位为准，不使用角色类型。

## 5. 个人空间的最小实现

个人空间不需要单独建一套新对象，本质上仍然是 `Project`。也就是说，“库”是产品对象，`Project` 是实现对象。

只需要给 `Project` 增补少量字段即可：

```text
Project
+ currentVersionId
```

说明（为什么只加少量字段就够用）：

1. 系统只承认“空间/库”这一种对象，不区分角色类型
2. 差别主要由引用关系与权限能力位决定
3. 这样复用现有模型最多，代码最稳

## 6. 现有表的最小扩展建议

### 6.1 Project

建议新增（这些字段的直观含义）：

字段解释：

- `visibility`：项目对外可见范围（私有/组织内/公开）。
- `isReferenceable`：是否允许被其他项目引用。
- `isCollaborative`：是否允许多人协作。

默认策略（全局默认安全）：

1. 新建库默认 `private`
2. `isReferenceable=false`
3. `isCollaborative=false`
4. 默认黑盒可见性；公开库默认透明
5. 用户点击“分享”时再显式开启可见/可引用/可协作

```text
+ currentVersionId
+ visibility
+ isReferenceable
+ isCollaborative
```

### 6.2 GenerationTask

建议新增（任务与结果解耦）：

```text
+ sessionId
+ basedOnVersionId
+ artifactId
```

### 6.3 Conversation

建议迁移为（让对话归属到会话）：

```text
+ sessionId
- projectId               // 可保留兼容一段时间，再逐步迁移
```

## 7. 典型查询怎么落

## 7.1 下游用户查看上游空间

查询：

1. 找到上游 `project`
2. 校验 `ProjectMember.canView`
3. 读取 `currentVersionId`
4. 基于当前版本按需生成 `Artifact`

## 7.2 下游用户创建自己的个人空间

写入：

1. 新建一个 `Project`
2. 新增一条 `ProjectReference(mode=follow, relationType=base)`
3. 初始化一个 `GenerationSession`

## 7.3 参与者提交修改

写入：

1. 参与者在自己的 `GenerationSession` 中生成结果
2. 保存一条 `CandidateChange`
3. 维护者审核
4. 通过后写入新的 `ProjectVersion`

## 8. 第一阶段实现建议

如果只做最小可落地版，建议按以下顺序补：

### P0

1. `GenerationSession` 扩展
2. `ProjectVersion`
3. `Artifact`

### P1

1. `ProjectReference`
2. `isReferenceable`

### P2

1. `CandidateChange`

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

1. `GenerationSession` 扩展
2. `ProjectReference`
3. `ProjectVersion`
4. `Artifact`
5. `CandidateChange`

这样既能承接当前比赛叙事，也能为下一阶段真正实现“库 / 课程空间 / 个人空间（学习空间为示例） / 引用复用 / 协作审核”提供清晰路径。
