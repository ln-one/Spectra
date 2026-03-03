# Environment Variables Configuration
<!-- REVIEW #B8 (P1): 文档定义了 CORS_ORIGINS，但当前 backend/main.py 尚未消费该变量（仍硬编码 allow_origins=["*"]）。 -->

## 后端环境变量

### 开发环境 (.env)

```bash
# =============================================================================
# Database Configuration
# =============================================================================
DATABASE_URL="file:./dev.db"

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
DEFAULT_MODEL="qwen-plus"

LLAMAPARSE_API_KEY="llx-your-llamaparse-api-key"
OPENAI_API_KEY="sk-your-openai-api-key"
# Document parser provider (see ADR-005 & backend/services/parsers/README.md)
# local (default) | mineru | llamaparse
DOCUMENT_PARSER="local"
# =============================================================================
# Vector Database Configuration
# =============================================================================
CHROMA_HOST="localhost"
CHROMA_PORT="8001"
CHROMA_PERSIST_DIR="./chroma_data"

EMBEDDING_MODEL="text-embedding-v2"
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
DEFAULT_MODEL="qwen-plus"

# Document parser provider (see ADR-005)
# 生产环境推荐 mineru（完全离线），或 local（轻量默认）
DOCUMENT_PARSER="local"

# =============================================================================
# Vector Database Configuration
# =============================================================================
CHROMA_HOST="chromadb"
CHROMA_PORT="8000"

# =============================================================================
# File Storage Configuration
# =============================================================================
STORAGE_TYPE="oss"
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
