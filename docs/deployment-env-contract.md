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

### `ALLOW_AI_STUB`

用途：

- 是否允许 AI stub 降级

要求：

- 演示环境默认不建议开启，除非明确接受降级演示

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

## 五、Vector / Retrieval / Chroma

### `CHROMA_HOST`
### `CHROMA_PORT`

用途：

- 远程 Chroma 连接

要求：

- 如果使用独立 Chroma 服务，则 `backend api` 与 `worker` 都应配置

### `CHROMA_PERSIST_DIR`

用途：

- 本地持久化目录

要求：

- 单机或本地开发使用
- 多机远程 Chroma 部署时可不依赖

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

用途：

- 启动期依赖健康要求

要求：

- 演示环境建议按真实依赖设置，不要全部放松

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
- `REDIS_HOST`
- `REDIS_PORT`
- `CHROMA_HOST`
- `CHROMA_PORT`

### Worker

建议至少配置：

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `DEFAULT_MODEL`
- `LARGE_MODEL`
- `SMALL_MODEL`
- `AI_REQUEST_TIMEOUT_SECONDS`
- `REDIS_HOST`
- `REDIS_PORT`
- `CHROMA_HOST`
- `CHROMA_PORT`
- `WORKER_NAME`
- `WORKER_RECOVERY_SCAN`

### Chroma / Redis / Postgres

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
