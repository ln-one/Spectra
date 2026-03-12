# Data Models

## 数据模型设计

基于 `backend/prisma/schema.prisma` 的数据模型定义。

## 用户与认证

### User 模型

```prisma
model User {
 id String @id @default(uuid())
 email String @unique
 password String // bcrypt 哈希
 username String @unique
 fullName String?
 
 projects Project[]
 
 createdAt DateTime @default(now())
 updatedAt DateTime @updatedAt
 
 @@index([email])
 @@index([username])
}
```

**字段说明**：
- `id`: UUID 主键
- `email`: 邮箱（唯一）
- `password`: bcrypt 哈希后的密码
- `username`: 用户名（唯一）
- `fullName`: 全名（可选）
- `projects`: 关联的项目列表

### IdempotencyKey 模型

```prisma
model IdempotencyKey {
 key String @id
 response String // JSON 格式的响应
 createdAt DateTime @default(now())
 
 @@index([createdAt])
}
```

**用途**: 防止重复请求，存储幂等性键和对应的响应结果。

## 核心业务模型

### Project 模型

```prisma
model Project {
 id String @id @default(uuid())
 userId String
 user User @relation(fields: [userId], references: [id], onDelete: Cascade)
 
 name String
 description String?
 
 // 教学信息
 subject String?
 gradeLevel String?
 duration Int?
 teachingObjectives String? // JSON 格式
 
 status String @default("draft")
 
 conversations Conversation[]
 uploads Upload[]
 generationTasks GenerationTask[]
 
 createdAt DateTime @default(now())
 updatedAt DateTime @updatedAt
 
 @@index([userId, status])
 @@index([userId, createdAt])
}
```

**字段说明**：
- `userId`: 所属用户 ID（数据隔离）
- `name`: 项目名称
- `subject`: 学科（语文/数学/英语等）
- `gradeLevel`: 学段（小学/初中/高中）
- `duration`: 课时（分钟）
- `teachingObjectives`: 教学目标（JSON）
- `status`: 状态（draft/in_progress/completed）

### Conversation 模型

```prisma
model Conversation {
 id String @id @default(uuid())
 projectId String
 project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
 
 role String // user/assistant/system
 content String
 metadata String? // JSON
 
 createdAt DateTime @default(now())
 
 @@index([projectId, createdAt])
}
```

**字段说明**：
- `projectId`: 所属项目 ID
- `role`: 角色（user/assistant/system）
- `content`: 消息内容
- `metadata`: 元数据（意图标签、关键词等，JSON 格式）

### Upload 模型

```prisma
model Upload {
 id String @id @default(uuid())
 projectId String
 project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
 
 filename String
 filepath String
 fileType String // pdf/word/ppt/image/video
 mimeType String?
 size Int
 
 status String @default("uploading")
 parseResult String? // JSON
 errorMessage String?
 usageIntent String?
 
 chunks ParsedChunk[]
 
 createdAt DateTime @default(now())
 updatedAt DateTime @updatedAt
 
 @@index([projectId, status])
}
```

**字段说明**：
- `fileType`: 文件类型（pdf/word/ppt/image/video）
- `status`: 状态（uploading/parsing/ready/failed）
- `parseResult`: 解析结果（JSON）
- `usageIntent`: 用户标注的文件用途

### ParsedChunk 模型

```prisma
model ParsedChunk {
 id String @id @default(uuid())
 uploadId String
 upload Upload @relation(fields: [uploadId], references: [id], onDelete: Cascade)
 
 content String
 chunkIndex Int
 metadata String? // JSON
 sourceType String
 
 createdAt DateTime @default(now())
 
 @@index([uploadId, chunkIndex])
}
```

**用途**: 存储文件解析后的可检索片段，用于 RAG 检索。

### GenerationTask 模型

```prisma
model GenerationTask {
 id String @id @default(uuid())
 projectId String
 project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
 
 taskType String // ppt/word/both
 status String @default("pending")
 progress Int @default(0)
 
 inputData String? // JSON
 outputUrls String? // JSON
 errorMessage String?
 
 createdAt DateTime @default(now())
 updatedAt DateTime @updatedAt
 
 @@index([projectId, status])
}
```

**字段说明**：
- `taskType`: 任务类型（ppt/word/both）
- `status`: 状态（pending/processing/completed/failed）
- `progress`: 进度（0-100）
- `outputUrls`: 输出文件 URL（JSON：{ppt_url, word_url}）

## 2026-03 架构修订（Gamma 大纲流 + NotebookLM 三栏）

> 说明：本节为 2026-03 sprint 冻结实现基线。对 A/B/C/D 的会话化改造任务，应以本节和 `docs/openapi-target-source.yaml` 为准；旧 `GenerationTask` 主流程仅表示当前兼容现状，不再作为新实现决策依据。

### 目标建模原则

- 会话优先：生成流程主实体从 `task` 升级为 `generation_session`。
- 大纲可版本化：大纲每次编辑/重写必须可追溯，可回退。
- 事件可回放：关键状态变化与用户命令必须落事件表，支持恢复与审计。
- 渲染解耦：继续保留 Marp/Pandoc 作为渲染层，不把渲染细节耦合进会话状态。

### 冻结模型（会话化主链路）

```prisma
model GenerationSession {
 id                    String   @id @default(uuid())
 projectId             String
 project               Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
 userId                String
 state                 String   @default("IDLE")
 stateReason           String?
 outputType            String   // ppt/word/both
 options               String?  // JSON：GenerationOptions
 progress              Int      @default(0)
 currentOutlineVersion Int      @default(1)
 renderVersion         Int      @default(0)
 pptUrl                String?
 wordUrl               String?
 errorCode             String?
 errorMessage          String?
 errorRetryable        Boolean  @default(false)
 resumable             Boolean  @default(false)
 lastCursor            String?
 clientSessionId       String?
 fallbacksJson         String?  // JSON：ExternalFallbackInfo[]
 outlineVersions       OutlineVersion[]
 events                SessionEvent[]
 tasks                 GenerationTask[]
 conversations         Conversation[]
 createdAt             DateTime @default(now())
 updatedAt             DateTime @updatedAt

 @@index([projectId, state])
 @@index([userId, state])
 @@index([clientSessionId])
}

model OutlineVersion {
 id           String   @id @default(uuid())
 sessionId    String
 session      GenerationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
 version      Int
 outlineData  String   // JSON：OutlineDocument
 changeReason String?
 createdAt    DateTime @default(now())

 @@unique([sessionId, version])
 @@index([sessionId, version])
}

model SessionEvent {
 id            String   @id @default(uuid())
 sessionId     String
 session       GenerationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
 eventType     String   // GenerationEventType
 state         String   // 事件发生时的 GenerationState
 stateReason   String?
 progress      Int?
 cursor        String   @unique
 payload       String?  // JSON：命令参数、fallback、trace 等
 schemaVersion Int      @default(1)
 createdAt     DateTime @default(now())

 @@index([sessionId, cursor])
 @@index([sessionId, createdAt])
}
```

补充约束：
- 字段命名以已提交 Prisma / OpenAPI 为准：`outputType`、`currentOutlineVersion`、`renderVersion`，不再使用早期草案中的 `mode`、`currentVersion`、`optionsSnapshot` 等命名。
- `context_snapshot` 仍保留在 API 响应层，作为会话快照载荷字段；是否持久化为独立列由后续实现决定，但不影响本轮状态机与命令契约。

### 现有模型的角色调整

- `GenerationTask`：降级为“渲染执行单元”，负责生成文件与进度，不再承载完整产品态。
- `Conversation`：继续承载聊天记录，并通过 `metadata.session_id` 关联会话上下文。
- `Upload`/`ParsedChunk`：继续承载资料层；会话使用素材通过 `options`/`context_snapshot` 承载，不再依赖早期草案字段名。

### 关系视图（冻结版）

```text
Project
 ├─ Conversation (NotebookLM 对话栏)
 ├─ Upload -> ParsedChunk (NotebookLM 资料栏)
 └─ GenerationSession (Gamma 流主实体)
     ├─ OutlineVersion[*] (大纲栏版本)
     ├─ SessionEvent[*] (状态/命令事件流)
     └─ GenerationTask[*] (渲染执行记录，兼容层)
```

### 迁移策略（架构约束）

1. Phase A（兼容期）：新增会话相关表，保留 `GenerationTask` 原接口可用。  
2. Phase B（切流期）：前端默认改走 `/generate/sessions`，旧接口内部转发到会话命令。  
3. Phase C（收敛期）：`GenerationTask` 仅保留导出与执行明细语义，退出产品主状态模型。

## 数据关联与级联删除

### 级联删除策略

所有外键关联都配置了 `onDelete: Cascade`，确保数据一致性：

- **删除用户** → 级联删除所有项目
- **删除项目** → 级联删除对话、上传、生成任务
- **删除上传** → 级联删除解析片段

**示例**:
```prisma
user User @relation(fields: [userId], references: [id], onDelete: Cascade)
```

**注意**: 级联删除是不可逆的，删除操作前应提示用户确认。

## 兼容性模型

### Course 模型（已废弃）

```prisma
model Course {
 id String @id @default(uuid())
 title String
 chapters String // JSON stored as text
 createdAt DateTime @default(now())
 updatedAt DateTime @updatedAt
}
```

**状态**: 保留用于兼容现有代码 
**计划**: 后续迁移到 Project 模型后移除

## 字段命名约定

### Prisma Schema (数据库层)
- 使用 **camelCase**：`userId`, `createdAt`, `fullName`
- 遵循 Prisma 命名规范

### API Layer (OpenAPI)
- 使用 **snake_case**：`user_id`, `created_at`, `full_name`
- 遵循 REST API 命名规范
<!-- REVIEW #B4 (P0): 当前 openapi-target.yaml 中 UserInfo 使用 createdAt/fullName，Project 使用 title/subject；而后端 Schema/DB 使用 name/description。API 契约与数据模型命名尚未统一。 -->

### 转换处理
在 Pydantic Schema 层进行字段名转换：

```python
# schemas/project.py
from pydantic import BaseModel, Field

class ProjectResponse(BaseModel):
 id: str
 user_id: str = Field(alias="userId")
 name: str
 created_at: datetime = Field(alias="createdAt")
 
 class Config:
 populate_by_name = True
```

## 相关文档

- [API Specification](../../openapi-target.yaml) - API 接口定义
- [Security Design](./security.md) - 数据隔离与权限控制
