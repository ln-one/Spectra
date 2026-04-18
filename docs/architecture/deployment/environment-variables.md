# Environment Variables Configuration

## Runtime Authority

For Docker and local multi-service development, the single source of truth for
business runtime configuration is [`backend/.env.example`](/Users/ln1/Projects/Spectra/backend/.env.example)
and your local `backend/.env`.

Keep these values in `backend/.env`:

- cross-service base URLs
- provider settings and model names
- runtime timeouts and feature toggles
- storage directories and collection names

Keep these values in Compose:

- image names
- host port mappings
- volumes
- health checks
- `depends_on`

## 后端环境变量

### 统一运行时 (`backend/.env`)

```bash
# =============================================================================
# Database Configuration
# =============================================================================
DATABASE_URL="postgresql://spectra:spectra@postgres:5432/spectra"

# =============================================================================
# Security Configuration
# =============================================================================
JWT_SECRET_KEY="your-super-secret-key-change-in-production"
JWT_ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=30

# =============================================================================
# AI/LLM Configuration
# =============================================================================
DASHSCOPE_API_KEY="sk-your-dashscope-api-key"
DEFAULT_MODEL="qwen3.5-flash"
LARGE_MODEL="qwen3.5-plus"
SMALL_MODEL="qwen3.5-flash"
AI_REQUEST_TIMEOUT_SECONDS=90
AI_UPSTREAM_RETRY_ATTEMPTS=1
AI_UPSTREAM_RETRY_DELAY_SECONDS=0.35
OUTLINE_DRAFT_TIMEOUT_SECONDS=90
PREVIEW_REBUILD_TIMEOUT_SECONDS=8
HEALTH_SERVICE_AUTHORITY_TIMEOUT_SECONDS=2
SERVICE_AUTHORITIES_REQUIRED=false
ALLOW_AI_STUB=false
ALLOW_COURSEWARE_FALLBACK=false

LLAMAPARSE_API_KEY="llx-your-llamaparse-api-key"
OPENAI_API_KEY="sk-your-openai-api-key"
# Document parser provider (see ADR-005 & backend/services/parsers/README.md)
# local (default) | mineru | llamaparse
DOCUMENT_PARSER="local"
# =============================================================================
# Retrieval Configuration
# =============================================================================
STRATUMIND_BASE_URL="http://stratumind:8110"
STRATUMIND_BASE_URL_LOCAL="http://127.0.0.1:8110"
STRATUMIND_TIMEOUT_SECONDS=15
QDRANT_URL="http://qdrant:6333"
QDRANT_COLLECTION_TEXT="stratumind_text_chunks"
QDRANT_COLLECTION_TEXT_ACTIVE="stratumind_text_chunks_v2"

EMBEDDING_MODEL="text-embedding-v3"
EMBEDDING_DIMENSION=1024
STRATUMIND_EMBEDDING_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
STRATUMIND_EMBEDDING_MODEL="text-embedding-v3"
STRATUMIND_EMBEDDING_DIMENSION=1024
STRATUMIND_RERANK_ENABLED=true
STRATUMIND_RERANK_BASE_URL="http://dualweave:8080"
STRATUMIND_RERANK_CANDIDATE_K=20
STRATUMIND_RERANK_TIMEOUT_SECONDS=10
STRATUMIND_RERANK_MODEL="qwen3-rerank"
DUALWEAVE_TEXT_RERANK_PROVIDER="dashscope"
DASHSCOPE_BASE_URL="https://dashscope.aliyuncs.com"
DASHSCOPE_TEXT_RERANK_MODEL="qwen3-rerank"
CHAT_RAG_TIMEOUT_SECONDS=5

DUALWEAVE_ENABLED=true
DUALWEAVE_BASE_URL="http://dualweave:8080"
DUALWEAVE_BASE_URL_LOCAL="http://127.0.0.1:8080"
DUALWEAVE_TIMEOUT_SECONDS=600
DUALWEAVE_POLL_INTERVAL_SECONDS=2
DUALWEAVE_RECONCILE_DELAY_SECONDS=2

DUALWEAVE_ADDR=":8080"
DUALWEAVE_LOCAL_DIR="/var/lib/dualweave/uploads"
DUALWEAVE_WORKFLOW_POLL_INTERVAL="3s"
DUALWEAVE_WORKFLOW_TIMEOUT="10m"
DUALWEAVE_HTTP_TIMEOUT="30s"
DUALWEAVE_READ_TIMEOUT="30s"
DUALWEAVE_WRITE_TIMEOUT="30s"
DUALWEAVE_IDLE_TIMEOUT="60s"
DUALWEAVE_CHUNK_SIZE=1048576

PAGEVRA_ENABLED=true
PAGEVRA_BASE_URL="http://pagevra:8090"
PAGEVRA_BASE_URL_LOCAL="http://127.0.0.1:8090"
PAGEVRA_TIMEOUT_SECONDS=180
PAGEVRA_DISTRIBUTION="image"
CHROME_PATH="/usr/bin/chromium"

OUROGRAPH_ENABLED=true
OUROGRAPH_BASE_URL="http://ourograph:8101"
OUROGRAPH_BASE_URL_LOCAL="http://127.0.0.1:8101"
OUROGRAPH_TIMEOUT_SECONDS=20
OUROGRAPH_DATABASE_URL="postgresql://spectra:spectra@postgres:5432/ourograph"
LIMORA_BASE_URL_LOCAL="http://127.0.0.1:3001"
DIEGO_BASE_URL_LOCAL="http://127.0.0.1:8000"

# =============================================================================
# File Storage Configuration
# =============================================================================
STORAGE_TYPE="local"
UPLOAD_DIR="/var/lib/spectra/uploads"
ARTIFACT_STORAGE_DIR="/var/lib/spectra/artifacts"
GENERATED_DIR="/var/lib/spectra/generated"
MAX_FILE_SIZE=104857600 # 100MB
ALLOWED_EXTENSIONS=".pdf,.docx,.pptx,.mp4,.mov"

# =============================================================================
# Server Configuration
# =============================================================================
DEBUG=True
HOST="0.0.0.0"
PORT=8000
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
DB_REQUIRED="true"
REDIS_REQUIRED="false"
HEALTH_DEPENDENCY_TIMEOUT_SECONDS=3

# =============================================================================
# Logging Configuration
# =============================================================================
LOG_LEVEL="DEBUG"
LOG_FORMAT="json"
```

生产环境也从 `backend/.env.example` 起步，保持相同变量名，只替换成真实
secret、存储后端和外部依赖地址。这样 Compose 与各服务 loader 读取的是同一套
运行契约，而不是多份彼此漂移的默认值。

## 前端环境变量

### 开发环境 (.env.local)

```bash
# API Configuration
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_API_TIMEOUT_MS=30000
NEXT_PUBLIC_CHAT_TIMEOUT_MS=300000

# App Configuration
NEXT_PUBLIC_APP_NAME="Spectra"
NEXT_PUBLIC_ENVIRONMENT="development"

# Feature Flags
NEXT_PUBLIC_ENABLE_AI_GENERATION="true"
NEXT_PUBLIC_ENABLE_FILE_UPLOAD="true"

# Upload Configuration
NEXT_PUBLIC_MAX_FILE_SIZE=104857600 # 100MB

# Debug
NEXT_PUBLIC_DEBUG="true"
```

### 生产环境 (.env.production)

```bash
# API Configuration
NEXT_PUBLIC_API_URL="https://api.spectra.com"
NEXT_PUBLIC_API_TIMEOUT_MS=30000
NEXT_PUBLIC_CHAT_TIMEOUT_MS=300000

# App Configuration
NEXT_PUBLIC_APP_NAME="Spectra"
NEXT_PUBLIC_APP_VERSION="1.0.0"
NEXT_PUBLIC_ENVIRONMENT="production"

# CDN Configuration
NEXT_PUBLIC_CDN_URL="https://cdn.spectra.com"

# Debug
NEXT_PUBLIC_DEBUG="false"
```

说明：

- 浏览器端 SDK 直接请求 `NEXT_PUBLIC_API_URL`
- `INTERNAL_API_URL` 仅供 Next.js 服务端或内部请求使用
- `NEXT_PUBLIC_CHAT_TIMEOUT_MS` 只放宽聊天请求，不建议依赖 Next rewrite 代理承载长聊天

`NEXT_PUBLIC_CHAT_TIMEOUT_MS` is intentionally separate from
`NEXT_PUBLIC_API_TIMEOUT_MS` so chat sends can wait longer for retrieval and
model work without stretching every frontend API call.

## 安全注意事项

## 健康检查端点

- `/health/live`：仅用于进程存活探测（不依赖数据库/Redis）。
- `/health/ready`：用于编排器就绪探测（会检查数据库与 Redis）。
- `/health`：兼容就绪探测语义，与 `/health/ready` 一致。

当 `DB_REQUIRED=true` 或 `REDIS_REQUIRED=true` 且依赖不可用时，`/health` 和 `/health/ready` 返回 `503`，并带标准化 `error.code/retryable/trace_id`。

### JWT_SECRET_KEY 生成

```bash
# 生成随机密钥
python -c "import secrets; print(secrets.token_urlsafe(32))"

# 或使用 openssl
openssl rand -base64 32
```

### 环境变量保护

```bash
# .gitignore
.env
.env.local
.env.production
*.key
```

### 密钥轮换

定期更换生产环境的 JWT_SECRET_KEY：

1. 生成新密钥
2. 更新环境变量
3. 重启服务
4. 用户需要重新登录

## 相关文档

- [Deployment Overview](../deployment.md) - 部署指南入口
- [Production Deployment](./production-deployment.md) - 生产部署步骤
- [Troubleshooting](./troubleshooting.md) - 排查手册
