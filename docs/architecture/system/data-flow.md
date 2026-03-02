# Data Flow Design

## 核心业务流程

### 1. 用户注册与登录

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant DB as Database

    U->>F: 访问注册页
    F->>U: 显示注册表单
    U->>F: 提交注册信息
    F->>B: POST /auth/register
    B->>B: 验证邮箱唯一性
    B->>B: 哈希密码 (bcrypt)
    B->>DB: 创建 User 记录
    DB-->>B: 返回用户信息
    B->>B: 生成 JWT Token
    B-->>F: 返回 {access_token, user}
    F->>F: 存储 Token
    F-->>U: 跳转到项目列表
```

### 2. 创建项目

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant DB as Database

    U->>F: 点击"新建项目"
    F->>U: 显示项目表单
    U->>F: 填写项目信息
    F->>B: POST /projects<br/>Header: Authorization: Bearer {token}
    B->>B: 验证 JWT Token
    B->>B: 提取 user_id
    B->>DB: 创建 Project 记录<br/>(userId = user_id)
    DB-->>B: 返回 project
    B-->>F: 返回项目信息
    F-->>U: 跳转到项目详情页
```

### 3. 对话交互

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant AI as AI Service
    participant DB as Database

    U->>F: 输入消息
    F->>B: POST /chat/messages<br/>Authorization + project_id
    B->>B: 验证用户权限
    B->>DB: 保存用户消息
    B->>DB: 获取对话历史
    B->>AI: 调用 Qwen API<br/>(message + history)
    AI-->>B: 返回 AI 回复
    B->>DB: 保存 AI 消息
    B-->>F: 返回 AI 回复
    F-->>U: 显示消息
```

### 4. 文件上传与解析

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant AI as External API
    participant DB as Database
    participant V as Vector DB

    U->>F: 拖拽文件上传
    F->>B: POST /files<br/>multipart/form-data
    B->>B: 验证用户权限
    B->>B: 计算文件 Hash 并检查是否存在重复（秒传逻辑）
    B->>B: 保存文件到指定 user/project 路径
    B->>DB: 记录文件元数据与存储路径
    B->>V: 解析完成后，将 Chunk 关联 DB 中的 upload_id 和 project_id，确保 RAG 检索不跨项目越权。
    B->>DB: 创建 Upload 记录<br/>(status=uploading)
    B-->>F: 返回文件信息
    
    Note over B,AI: 异步处理
    B->>AI: 调用当前解析链路 (pypdf/docx/pptx)
    Note over B,AI: MinerU/LlamaParse/Qwen-VL 为规划中能力
    AI-->>B: 返回解析结果
    B->>DB: 更新 Upload<br/>(status=ready, parseResult)
    B->>DB: 创建 ParsedChunk 记录
    B->>V: 向量化并存储
    B-->>F: WebSocket 通知解析完成
    F-->>U: 更新文件状态
```

### 5. 课件生成

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant V as Vector DB
    participant AI as AI Service
    participant DB as Database

    U->>F: 点击"生成课件"
    F->>B: POST /generate/courseware<br/>Authorization + project_id
    B->>B: 验证用户权限
    B->>DB: 创建 GenerationTask<br/>(status=pending)
    B-->>F: 返回 task_id
    
    Note over B,AI: 后台处理
    B->>V: RAG 检索相关内容
    V-->>B: 返回检索结果
    B->>AI: 生成课件内容<br/>(objectives + RAG results)
    AI-->>B: 返回课件 Markdown
    B->>B: 调用 Marp 生成 PPT
    B->>B: 调用 Pandoc 生成 Word
    B->>DB: 更新 GenerationTask<br/>(status=completed, outputUrls)
    
    Note over F: 前端轮询
    F->>B: GET /generate/status/{task_id}
    B->>DB: 查询任务状态
    B-->>F: 返回状态和进度
    F-->>U: 更新进度条
```

### 6. 预览与修改

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant AI as AI Service
    participant DB as Database

    U->>F: 访问预览页
    F->>B: GET /preview/{task_id}<br/>Authorization
    B->>B: 验证用户权限
    B->>DB: 查询生成结果
    B-->>F: 返回预览数据<br/>(slides + lesson_plan)
    F-->>U: 显示课件预览
    
    U->>F: 提出修改意见
    F->>B: POST /preview/{task_id}/modify<br/>instruction
    B->>B: 验证用户权限
    B->>AI: 理解修改意图
    AI-->>B: 返回修改指令
    B->>AI: 局部再生成
    AI-->>B: 返回新版本
    B->>DB: 更新生成结果
    B-->>F: 返回更新后的预览
    F-->>U: 刷新显示
```

## 数据流特点

### 认证流
- 所有 API 请求都需要 JWT Token
- Token 在请求头中传递：`Authorization: Bearer {token}`
- 后端自动验证 Token 并提取 user_id

### 权限流
- 所有资源访问都检查 userId
- Project、Upload、GenerationTask 都关联 userId
- 自动过滤非当前用户的数据

### 异步流
- 文件解析异步处理
- 课件生成异步处理
- 前端通过轮询或 WebSocket 获取状态

### 幂等流
- 关键操作支持幂等性键
- 防止重复提交
- 缓存响应结果

## 相关文档

- [Security Architecture](./security-architecture.md) - 安全架构
- [API Specification](../../openapi.yaml) - API 定义
