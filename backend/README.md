# Spectra-Backend

FastAPI backend project with Python 3.11, Pydantic v2, and Prisma ORM. Optimized for stable AI-native coding.

## Features

- **FastAPI**: Modern, fast web framework for building APIs
- **Pydantic v2**: Data validation using Python type annotations
- **Prisma Client Python**: Next-generation ORM for Python
- **LiteLLM**: Unified API for multiple LLM providers
- **CORS Enabled**: Cross-Origin Resource Sharing support
- **Structured**: Clean separation with /routers, /services, /schemas

## Project Structure

```
Spectra-Backend/
├── routers/          # API route handlers
│   ├── auth.py       # Authentication endpoints
│   ├── files.py      # File upload endpoints
│   ├── generate.py   # AI generation endpoints
│   ├── projects.py   # Project management endpoints
│   ├── chat.py       # Chat endpoints
│   ├── preview.py    # Preview endpoints
│   ├── rag.py        # RAG search endpoints
│   └── courses.py    # Course management endpoints (legacy)
├── services/         # Business logic layer
│   ├── db_service.py # Database operations
│   ├── ai_service.py # AI service integration
│   ├── file_service.py # File handling
│   └── auth_service.py # Authentication service
├── schemas/          # Pydantic models
│   └── __init__.py   # Data validation schemas
├── utils/            # Utility modules
│   ├── dependencies.py # FastAPI dependencies
│   ├── exceptions.py   # Custom exceptions
│   ├── logger.py       # Logging configuration
│   └── responses.py    # Response formatters
├── prisma/           # Prisma ORM
│   ├── schema.prisma # Database schema
│   └── migrations/   # Database migrations
├── uploads/          # Uploaded files directory
├── main.py           # Application entry point
├── requirements.txt  # Python dependencies
└── .env.example      # Environment variables template
```

## Setup

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Generate Prisma client**:
   ```bash
   prisma generate
   ```

4. **Run database migrations**:
   ```bash
   prisma db push
   ```

5. **Start the server**:
   ```bash
   uvicorn main:app --reload
   ```

The API will be available at `http://localhost:8000`

## API Endpoints

All API endpoints are prefixed with `/api/v1`.

### Root
- `GET /` - Welcome message
- `GET /health` - Health check

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - User login
- `GET /api/v1/auth/me` - Get current user

### Files
- `POST /api/v1/files` - Upload a file
- `PATCH /api/v1/files/{file_id}/intent` - Update file intent
- `GET /api/v1/projects/{project_id}/files` - List project files

### AI Generation
- `POST /api/v1/generate/courseware` - Generate courseware
- `GET /api/v1/generate/status/{task_id}` - Check generation status

### Projects
- `GET /api/v1/projects` - Get all projects
- `POST /api/v1/projects` - Create a new project
- `GET /api/v1/projects/{project_id}` - Get project details

### Chat
- `POST /api/v1/chat/messages` - Send chat message
- `GET /api/v1/chat/messages` - Get chat history

### Preview
- `GET /api/v1/preview/{task_id}` - Get preview
- `POST /api/v1/preview/{task_id}/modify` - Modify preview

### RAG
- `POST /api/v1/rag/search` - Search knowledge base
- `GET /api/v1/rag/sources/{chunk_id}` - Get source chunk

## Models

### Data Models

The project uses Prisma ORM with the following main models:

- **User**: User accounts with authentication
- **Project**: User projects containing files and conversations
- **Upload**: Uploaded files with parsing status
- **ParsedChunk**: Parsed document chunks for RAG
- **Conversation**: Chat conversations
- **GenerationTask**: Async courseware generation tasks
- **IdempotencyKey**: Request idempotency tracking

See `prisma/schema.prisma` for complete schema definitions.

## API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### OpenAPI 规范

- **设计文档**: `../docs/openapi/` - 模块化的 API 设计（给开发者和 AI 看）
- **自动生成**: FastAPI 自动生成 OpenAPI 规范（访问 `/openapi.json`）
- **工作流程**: 参见 [OPENAPI_WORKFLOW.md](./OPENAPI_WORKFLOW.md)

开发时应参照 `../docs/openapi/` 中的模块文件来实现接口，确保设计和实现保持一致。

## Development

The project uses:
- Python 3.11+
- FastAPI for the web framework
- Pydantic v2 for data validation
- Prisma for database ORM
- LiteLLM for AI integrations
- SQLite for development database (PostgreSQL for production)
- JWT for authentication
- ChromaDB for vector storage

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL="file:./dev.db"

# Security
JWT_SECRET_KEY="your-secret-key"
JWT_ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=30

# AI/LLM
DASHSCOPE_API_KEY="your-dashscope-key"
LLAMAPARSE_API_KEY="your-llamaparse-key"
OPENAI_API_KEY="your-openai-key"
DEFAULT_MODEL="qwen-plus"

# Vector Database
CHROMA_HOST="localhost"
CHROMA_PORT="8001"

# File Storage
STORAGE_TYPE="local"
MAX_FILE_SIZE=104857600  # 100MB
```

### Code Quality

Run quality checks:

```bash
# Format code
black .
isort .

# Lint
flake8 . --max-line-length=88 --extend-ignore=E203

# Test
pytest
```

## License

This project is licensed under the [Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/).
