# Deployment Env Contract

## 更新日期

- 2026-03-19

## 目的

把当前演示环境 / 多机部署真正会依赖的环境变量收成一份可读、可检查、可交接的契约。

这份文档关注的是：

- 哪些变量是必须的
- 哪些变量只是能力增强项
- 哪些变量应该落在 API 机
- 哪些变量应该落在 worker / 数据服务机

它不是 `.env.example` 的替代品，而是部署时的语义说明。

---

## 一、核心原则

1. 演示环境只部署 `main`
2. 不同机器只配置自己需要的变量
3. 必填项要有明确 owner，不允许“靠默认值先跑起来”
4. 默认值只用于本地开发，不应用于演示环境

---

## 二、全局必填项

这些变量至少会影响 `backend api`，通常也会影响 `worker`。

### `DATABASE_URL`

用途：

- Prisma 主数据库连接

要求：

- 演示环境必须配置
- 本地/演示/多机统一使用明确的 PostgreSQL 连接串

### `JWT_SECRET_KEY`

用途：

- 登录态签名
- access / refresh token 验证

要求：

- 演示环境必须配置
- 不允许保留开发占位值

---

## 三、AI / Provider 相关

这些变量影响生成链路、聊天链路、视频理解、embedding 等能力。

### `DEFAULT_MODEL`
### `LARGE_MODEL`
### `SMALL_MODEL`

用途：

- 控制 AI 路由默认模型

要求：

- 推荐在 `backend api` 与 `worker` 保持一致

### `AI_REQUEST_TIMEOUT_SECONDS`

用途：

- 控制 AI completion timeout

要求：

- `backend api` 与 `worker` 保持一致

### `OUTLINE_DRAFT_TIMEOUT_SECONDS`

用途：

- 控制会话状态 `DRAFTING_OUTLINE` 阶段的大纲草拟超时
- 超时后快速进入失败回退（避免用户长时间等待）

要求：

- 建议在 `backend api` 与 `worker` 保持一致（例如 `90`）
- 值应为正数

### `PREVIEW_REBUILD_TIMEOUT_SECONDS`

用途：

- 控制 preview 缓存缺失时的 AI 重建超时，避免 `/preview` 长尾阻塞

要求：

- 建议在 `backend api` 明确配置（例如 `8`）
- 值应为正数；超时后接口应快速降级返回

### `TOOL_CHECK_CACHE_TTL_SECONDS`

用途：

- 缓存 Marp/Pandoc 可用性探测结果，减少高频渲染时重复子进程检查开销

要求：

- 建议在 `backend api` 与 `worker` 保持一致
- 设为 `0` 可关闭缓存（仅用于排障）

### `HEALTH_TOOL_TIMEOUT_SECONDS`

用途：

- 控制 `/health` 对 Marp/Pandoc 工具链探测的超时时间

要求：

- 建议在 `backend api` 明确配置（例如 `2`）
- 值应为正数，避免健康检查卡住

### `ALLOW_AI_STUB`

用途：

- 是否允许 AI stub 降级

要求：

- 演示环境默认不建议开启，除非明确接受降级演示

### `ALLOW_OFFICE_PLACEHOLDER_ARTIFACTS`

用途：

- Office 产物渲染彻底失败时是否允许生成占位 DOCX/PPTX

要求：

- 默认关闭
- 仅在显式开发调试场景建议开启
- 若关闭则应让渲染失败显式暴露，而不是静默产出假文件

### `ALLOW_MEDIA_PLACEHOLDER_ARTIFACTS`

用途：

- GIF / MP4 等尚未正式渲染接入的 media 产物是否允许生成占位二进制

要求：

- 默认关闭
- 仅在显式开发调试场景建议开启
- 若关闭则应明确失败，而不是静默产出假媒体文件

### `DASHSCOPE_API_KEY`

用途：

- 视频理解
- LLM provider
- embedding provider

要求：

- 如果要完整演示 AI / 视频 / embedding 能力，则必须配置
- 如果未配置，系统应退化但不能卡死

### `TAVILY_API_KEY`
### `BING_SEARCH_API_KEY`

用途：

- Web search provider

要求：

- 至少配置其中一种，才能稳定演示 web search

---

## 四、Queue / Worker / Redis

这些变量主要影响 `worker` 和异步链路。

### `REDIS_HOST`
### `REDIS_PORT`
### `REDIS_DB`
### `REDIS_PASSWORD`

用途：

- RQ / queue / task state

要求：

- `backend api` 与 `worker` 需一致
- 建议走内网地址

### `WORKER_NAME`
### `RQ_WORKER_CLASS`
### `WORKER_RECOVERY_SCAN`

用途：

- worker 标识
- worker 类型
- stale task recovery

要求：

- 至少在 `worker` 机明确配置

### `RQ_RAG_INDEX_TIMEOUT`
### `RQ_RAG_INDEX_TIMEOUT_MAX`
### `RQ_RESULT_TTL`
### `RQ_FAILURE_TTL`

用途：

- queue timeout / result TTL / failure TTL

要求：

- 推荐 `backend api` 与 `worker` 一致

---

## 五、Retrieval / Stratumind / Qdrant

### `STRATUMIND_BASE_URL`
### `STRATUMIND_TIMEOUT_SECONDS`

用途：

- backend / worker 调用 `Stratumind` 文本检索服务

要求：

- `backend api` 与 `worker` 都应配置
- 必须指向独立 `Stratumind` 服务

### `QDRANT_URL`

用途：

- `Stratumind` 使用的向量存储底盘地址

要求：

- 部署 `Stratumind` 的环境必须配置
- backend 不直接依赖它的业务语义

## 六、文件与产物存储

### `UPLOAD_DIR`

用途：

- 用户上传文件存储根目录

要求：

- 演示环境和分布式部署建议显式配置
- 不建议继续依赖 repo-local `uploads`
- 后端 `FileService` 默认会读取这个变量
- Docker / 多机准备阶段建议挂到共享运行时卷，例如 `/var/lib/spectra/uploads`

### `ARTIFACT_STORAGE_DIR`

用途：

- project-space artifact 存储根目录

要求：

- 分布式部署建议显式配置到共享卷或明确挂载点
- 不建议继续依赖默认 `uploads/artifacts`
- artifact generator 默认会读取这个变量
- Docker / 多机准备阶段建议挂到共享运行时卷，例如 `/var/lib/spectra/artifacts`

### `POSTGRES_BACKUP_DIR`

用途：
- PostgreSQL 逻辑备份落盘目录

建议：
- 切库和云部署阶段应显式配置
- 应为共享、绝对路径，例如 `/var/lib/spectra/backups` 或 `/var/backups/spectra`
- 不建议继续依赖 repo-local `backup/`

### `POSTGRES_RESTORE_STAGING_DIR`

用途：
- PostgreSQL 恢复时的 staging 目录

建议：
- 切库和恢复演练阶段建议显式配置
- 应为共享、绝对路径，例如 `/var/lib/spectra/restore-staging`

### `POSTGRES_BACKUP_RETENTION_DAYS`

用途：
- PostgreSQL 备份保留天数

建议：
- 建议显式配置为正整数

### `POSTGRES_BACKUP_PREFIX`

用途：
- PostgreSQL 备份文件名前缀

建议：
- 建议按环境/项目显式配置，例如 `spectra-demo`

### `PG_DUMP_BIN`
### `PG_RESTORE_BIN`
### `PSQL_BIN`

用途：
- PostgreSQL backup / restore / rollback drill 的 CLI toolchain

建议：
- 如果机器本身安装了 PostgreSQL CLI，建议显式配置
- 若不配置，则默认分别回落到 `pg_dump` / `pg_restore` / `psql`

### `POSTGRES_BACKUP_USE_DOCKER`
### `POSTGRES_TOOLCHAIN_IMAGE`
### `DOCKER_BIN`

用途：
- 当宿主机没有 PostgreSQL CLI 时，允许 backup / restore drill 走 Docker fallback

建议：
- 如果启用 `POSTGRES_BACKUP_USE_DOCKER=true`，则应保证 `docker` 可用
- `POSTGRES_TOOLCHAIN_IMAGE` 默认为 `postgres:16-alpine`

### `GENERATED_DIR`

用途：

- generation service 临时/输出目录

要求：

- 分布式部署建议显式配置
- 至少要明确它是否走共享卷、临时卷或后续对象存储
- generation service 和 preview cache 默认会读取这个变量
- Docker / 多机准备阶段建议挂到共享运行时卷，例如 `/var/lib/spectra/generated`

补充：
- PostgreSQL 备份与恢复 staging 目录也建议统一落在共享运行时卷下，例如 `/var/lib/spectra/backups` 与 `/var/lib/spectra/restore-staging`

---

## 七、解析 / 多媒体能力

### `DOCUMENT_PARSER`

用途：

- 选择文档解析 provider

### `LLAMAPARSE_API_KEY`

用途：

- 远程解析 provider

### `WHISPER_MODEL_SIZE`
### `WHISPER_DEVICE`
### `WHISPER_COMPUTE_TYPE`

用途：

- 音频转录本地能力配置

### `QWEN_VL_MODEL`
### `VIDEO_FRAME_INTERVAL`

用途：

- 视频理解模型与抽帧参数

要求：

- 这些变量主要影响 `worker` / 多媒体处理机
- 演示环境如果机器较弱，应谨慎打开本地重型能力

---

## 七、文件与索引链路

### `ALLOWED_EXTENSIONS`
### `MAX_FILE_SIZE`

用途：

- 上传入口约束

### `SYNC_RAG_INDEXING`

用途：

- 是否同步执行索引

要求：

- 演示环境通常建议保持异步，避免阻塞 API

---

## 八、生成与导出

### `CHROME_PATH`

用途：

- Marp / 浏览器导出链路

### `ALLOW_COURSEWARE_FALLBACK`

用途：

- 课件生成回退策略

### `OUTLINE_DRAFT_WATCHDOG_SECONDS`

用途：

- outline draft watchdog / stuck 回收

要求：

- API 和 worker 最好保持一致认知

---

## 九、运维与观测

### `LOG_LEVEL`
### `LOG_FORMAT`
### `DEBUG`

用途：

- 日志级别
- 日志格式
- 调试输出

要求：

- 演示环境不建议长期开启 `DEBUG=true`

### `DB_REQUIRED`
### `REDIS_REQUIRED`
### `GENERATION_TOOLS_REQUIRED`

用途：

- 启动期依赖健康要求

要求：

- 演示环境建议按真实依赖设置，不要全部放松
- 若演示链路依赖 PPT/Word 真实生成，建议 `GENERATION_TOOLS_REQUIRED=true`

---

## 十、推荐最小配置组合

### Backend API

建议至少配置：

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `DEFAULT_MODEL`
- `LARGE_MODEL`
- `SMALL_MODEL`
- `AI_REQUEST_TIMEOUT_SECONDS`
- `PREVIEW_REBUILD_TIMEOUT_SECONDS`
- `TOOL_CHECK_CACHE_TTL_SECONDS`
- `HEALTH_TOOL_TIMEOUT_SECONDS`
- `GENERATION_TOOLS_REQUIRED`
- `REDIS_HOST`
- `REDIS_PORT`
- `STRATUMIND_BASE_URL`
- `STRATUMIND_TIMEOUT_SECONDS`
- `QDRANT_URL`

### Worker

建议至少配置：

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `DEFAULT_MODEL`
- `LARGE_MODEL`
- `SMALL_MODEL`
- `AI_REQUEST_TIMEOUT_SECONDS`
- `TOOL_CHECK_CACHE_TTL_SECONDS`
- `REDIS_HOST`
- `REDIS_PORT`
- `STRATUMIND_BASE_URL`
- `STRATUMIND_TIMEOUT_SECONDS`
- `QDRANT_URL`
- `WORKER_NAME`
- `WORKER_RECOVERY_SCAN`

### Stratumind / Qdrant / Redis / Postgres

这些服务应优先使用：

- 内网地址
- 固定端口
- 不暴露公网

---

## 十一、建议配套检查

部署前运行：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deploy_preflight.py
```

按角色检查环境变量是否齐备：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deployment_env_role_audit.py backend
python3 /Users/ln1/Projects/Spectra/backend/scripts/deployment_env_role_audit.py worker
```

部署后运行：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deploy_smoke_check.py \
  --base-url http://localhost:8000
```

---

## 一句话结论

演示环境真正要稳定，不只是“有一份 `.env`”，而是：

- 知道每个变量控制什么
- 知道它应该在哪台机器上出现
- 知道哪些缺失只是降级，哪些缺失会直接阻断系统
