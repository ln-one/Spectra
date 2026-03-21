# Environment Variables Configuration

## 后端环境变量

### 开发环境 (.env)

```bash
# =============================================================================
# Database Configuration
# =============================================================================
DATABASE_URL="postgresql://spectra:spectra@127.0.0.1:5432/spectra"

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
DEFAULT_MODEL="qwen3.5-plus"
LARGE_MODEL="qwen3.5-plus"
SMALL_MODEL="qwen3.5-plus"
AI_REQUEST_TIMEOUT_SECONDS=45
OUTLINE_DRAFT_TIMEOUT_SECONDS=25
PREVIEW_REBUILD_TIMEOUT_SECONDS=8
TOOL_CHECK_CACHE_TTL_SECONDS=300
HEALTH_TOOL_TIMEOUT_SECONDS=2
GENERATION_TOOLS_REQUIRED=false

LLAMAPARSE_API_KEY="llx-your-llamaparse-api-key"
OPENAI_API_KEY="sk-your-openai-api-key"
# Document parser provider (see ADR-005 & backend/services/parsers/README.md)
# local (default) | mineru | llamaparse
DOCUMENT_PARSER="local"
# =============================================================================
# Vector Database Configuration
# =============================================================================
CHROMA_MODE="persistent"
CHROMA_HOST="localhost"
CHROMA_PORT="8001"
CHROMA_PERSIST_DIR="chroma_data"

EMBEDDING_MODEL="text-embedding-v4"
EMBEDDING_DIMENSION=1536

# =============================================================================
# File Storage Configuration
# =============================================================================
STORAGE_TYPE="local"
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=104857600 # 100MB
ALLOWED_EXTENSIONS=".pdf,.docx,.pptx,.mp4,.mov"

# =============================================================================
# Server Configuration
# =============================================================================
DEBUG=True
HOST="0.0.0.0"
PORT=8000
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
DB_REQUIRED="false"
REDIS_REQUIRED="false"
HEALTH_DEPENDENCY_TIMEOUT_SECONDS=3

# =============================================================================
# Logging Configuration
# =============================================================================
LOG_LEVEL="DEBUG"
LOG_FORMAT="json"
```

### 生产环境 (.env.prod)

```bash
# =============================================================================
# Database Configuration
# =============================================================================
DATABASE_URL="postgresql://user:password@postgres:5432/spectra"

# =============================================================================
# Security Configuration (重要！)
# =============================================================================
JWT_SECRET_KEY="CHANGE-THIS-TO-A-RANDOM-SECRET-KEY-IN-PRODUCTION"
JWT_ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=1440 # 24 小时

# =============================================================================
# AI/LLM Configuration
# =============================================================================
DASHSCOPE_API_KEY="sk-your-production-dashscope-api-key"
LLAMAPARSE_API_KEY="llx-your-production-llamaparse-api-key"
DEFAULT_MODEL="qwen3.5-plus"
LARGE_MODEL="qwen3.5-plus"
SMALL_MODEL="qwen3.5-plus"
AI_REQUEST_TIMEOUT_SECONDS=45
OUTLINE_DRAFT_TIMEOUT_SECONDS=25
PREVIEW_REBUILD_TIMEOUT_SECONDS=8
TOOL_CHECK_CACHE_TTL_SECONDS=300
HEALTH_TOOL_TIMEOUT_SECONDS=2
GENERATION_TOOLS_REQUIRED=true

# Document parser provider (see ADR-005)
# 生产环境推荐 local（当前可用）；mineru（完全离线，待集成完成后再启用）
DOCUMENT_PARSER="local"

# =============================================================================
# Vector Database Configuration
# =============================================================================
CHROMA_MODE="persistent"
CHROMA_HOST="chromadb"
CHROMA_PORT="8000"
CHROMA_PERSIST_DIR="/var/lib/spectra/chroma"

# =============================================================================
# File Storage Configuration
# =============================================================================
STORAGE_TYPE="oss"
UPLOAD_DIR="/var/lib/spectra/uploads"
ARTIFACT_STORAGE_DIR="/var/lib/spectra/artifacts"
GENERATED_DIR="/var/lib/spectra/generated"
OSS_ACCESS_KEY="your-oss-access-key"
OSS_SECRET_KEY="your-oss-secret-key"
OSS_BUCKET="spectra-prod"
OSS_ENDPOINT="oss-cn-hangzhou.aliyuncs.com"

# =============================================================================
# Cache Configuration
# =============================================================================
REDIS_HOST="redis"
REDIS_PORT=6379
CACHE_TTL=3600

# =============================================================================
# Server Configuration
# =============================================================================
DEBUG=False
HOST="0.0.0.0"
PORT=8000
CORS_ORIGINS="https://spectra.com,https://www.spectra.com"
DB_REQUIRED="true"
REDIS_REQUIRED="true"
HEALTH_DEPENDENCY_TIMEOUT_SECONDS=3

# =============================================================================
# Monitoring Configuration
# =============================================================================
SENTRY_DSN="https://your-sentry-dsn"
ENABLE_METRICS=True

# =============================================================================
# Logging Configuration
# =============================================================================
LOG_LEVEL="INFO"
LOG_FORMAT="json"
```

## 前端环境变量

### 开发环境 (.env.local)

```bash
# API Configuration
NEXT_PUBLIC_API_URL="http://localhost:8000"

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

# App Configuration
NEXT_PUBLIC_APP_NAME="Spectra"
NEXT_PUBLIC_APP_VERSION="1.0.0"
NEXT_PUBLIC_ENVIRONMENT="production"

# CDN Configuration
NEXT_PUBLIC_CDN_URL="https://cdn.spectra.com"

# Debug
NEXT_PUBLIC_DEBUG="false"
```

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
