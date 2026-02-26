# Spectra - Multimodal AI Teaching Assistant

[![CI](https://github.com/ln-one/Spectra/actions/workflows/ci.yml/badge.svg)](https://github.com/ln-one/Spectra/actions/workflows/ci.yml)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

An AI-powered intelligent courseware generation system that helps educators quickly create high-quality multimodal teaching materials through natural conversation.

## 📚 快速导航

| 入门指南 | 开发规范 | 其他 |
|---------|---------|------|
| [🚀 快速开始](./docs/guides/getting-started.md) | [🎨 前端规范](./docs/standards/frontend.md) | [📖 贡献指南](./docs/CONTRIBUTING.md) |
| [🐳 Docker 配置](./docs/guides/docker-setup.md) | [⚙️ 后端规范](./docs/standards/backend.md) | [🔄 CI/CD](./docs/guides/ci-cd.md) |
| [🧪 测试指南](./docs/guides/testing.md) | [📝 Git 规范](./docs/standards/git.md) | [📋 技术决策](./docs/decisions/) |

## Project Structure

```
Spectra/                    # Monorepo root
├── frontend/               # Next.js 15 frontend application
│   ├── app/               # Next.js App Router pages
│   │   ├── auth/          # Authentication pages (login/register)
│   │   ├── layout.tsx     # Root layout with providers
│   │   └── page.tsx       # Dashboard/home page
│   ├── components/        # React components
│   │   └── ui/            # Shadcn/ui component library
│   ├── lib/               # Utility functions and helpers
│   │   ├── api/           # API client modules
│   │   │   ├── client.ts  # Base HTTP client (axios)
│   │   │   ├── auth.ts    # Authentication API
│   │   │   ├── projects.ts # Projects API
│   │   │   ├── files.ts   # File upload API
│   │   │   └── index.ts   # Unified exports
│   │   ├── auth.ts        # Auth utilities (token management)
│   │   ├── utils.ts       # Helper functions
│   │   └── types/         # TypeScript type definitions
│   ├── stores/            # Zustand state management
│   ├── hooks/             # Custom React hooks
│   ├── __tests__/         # Jest test files
│   ├── .cursorrules       # Frontend-specific AI rules
│   ├── package.json       # Frontend dependencies
│   └── next.config.mjs    # Next.js configuration
│
├── backend/                # FastAPI backend service
│   ├── routers/           # API route handlers
│   │   ├── auth.py        # Authentication endpoints
│   │   ├── files.py       # File upload/management
│   │   ├── projects.py    # Project CRUD operations
│   │   ├── chat.py        # Chat interface
│   │   ├── preview.py     # Preview generation
│   │   ├── rag.py         # RAG knowledge search
│   │   └── generate.py    # AI courseware generation
│   ├── services/          # Business logic layer
│   │   ├── db_service.py      # Database operations
│   │   ├── file_service.py    # File handling
│   │   ├── ai_service.py      # AI integration (LiteLLM)
│   │   ├── auth_service.py    # Authentication logic
│   │   ├── vector_service.py  # ChromaDB vector operations
│   │   ├── embedding_service.py # Text embeddings
│   │   └── generation_service.py # Document generation
│   ├── utils/             # Utility modules
│   │   ├── dependencies.py    # FastAPI dependencies
│   │   ├── exceptions.py      # Custom exceptions
│   │   ├── logger.py          # Logging configuration
│   │   └── responses.py       # Response formatters
│   ├── schemas/           # Pydantic data models
│   │   ├── auth.py        # Auth request/response models
│   │   ├── courses.py     # Project/course models
│   │   ├── generation.py  # Generation models
│   │   └── rag.py         # RAG search models
│   ├── prisma/            # Prisma ORM
│   │   ├── schema.prisma  # Database schema definition
│   │   └── migrations/    # Database migration files
│   ├── tests/             # Pytest test files (188 tests)
│   ├── templates/         # Marp/Pandoc templates
│   ├── themes/            # Presentation themes
│   ├── .cursorrules       # Backend-specific AI rules
│   ├── requirements.txt   # Python dependencies
│   ├── main.py            # FastAPI application entry
│   └── pytest.ini         # Pytest configuration
│
├── docs/                   # Project documentation
│   ├── openapi/           # Modular OpenAPI specification
│   │   ├── paths/         # API endpoint definitions (by module)
│   │   │   ├── auth.yaml      # Authentication endpoints
│   │   │   ├── chat.yaml      # Chat endpoints
│   │   │   ├── files.yaml     # File endpoints
│   │   │   ├── generate.yaml  # Generation endpoints
│   │   │   ├── preview.yaml   # Preview endpoints
│   │   │   ├── project.yaml   # Project endpoints
│   │   │   └── rag.yaml       # RAG endpoints
│   │   ├── schemas/       # Data model definitions (by module)
│   │   │   ├── common.yaml    # Shared schemas
│   │   │   ├── auth.yaml      # Auth models
│   │   │   ├── chat.yaml      # Chat models
│   │   │   └── ...            # Other domain models
│   │   └── components/    # Reusable OpenAPI components
│   │       ├── parameters.yaml # Common parameters
│   │       ├── responses.yaml  # Common responses
│   │       └── security.yaml   # Security schemes
│   ├── architecture/      # Architecture documentation
│   │   ├── backend/       # Backend architecture
│   │   ├── frontend/      # Frontend architecture
│   │   ├── system/        # System design
│   │   └── deployment/    # Deployment guides
│   ├── decisions/         # Architecture Decision Records (ADR)
│   ├── requirements/      # Requirements documentation
│   │   ├── functional/    # Functional requirements
│   │   ├── ai/            # AI capabilities
│   │   └── ux/            # UX requirements
│   ├── guides/            # Development guides
│   │   ├── getting-started.md # Quick start guide
│   │   ├── docker-setup.md    # Docker setup
│   │   ├── testing.md         # Testing guide
│   │   └── ci-cd.md           # CI/CD guide
│   ├── standards/         # Coding standards
│   │   ├── frontend.md    # Frontend standards
│   │   ├── backend.md     # Backend standards
│   │   ├── git.md         # Git workflow
│   │   └── documentation.md # Documentation standards
│   ├── .cursorrules       # Documentation AI rules
│   ├── openapi-source.yaml # OpenAPI main file (references modules)
│   ├── openapi.yaml       # Bundled OpenAPI (auto-generated)
│   └── CONTRIBUTING.md    # Contribution guidelines
│
├── .ai/                    # AI collaboration system
│   ├── guides/            # Task-specific AI guides
│   │   ├── adding-api-endpoint.md  # API development guide
│   │   ├── creating-component.md   # Component creation guide
│   │   ├── api-workflow.md         # Complete API workflow
│   │   ├── best-practices.md       # Best practices
│   │   └── troubleshooting.md      # Common issues
│   ├── CONTEXT.md         # Single entry point for AI (must-read)
│   ├── FAQ.md             # Frequently asked questions
│   ├── self-check.md      # AI understanding verification
│   └── CHANGELOG.md       # AI system change log
│
├── .github/                # GitHub configuration
│   ├── workflows/         # GitHub Actions CI/CD
│   │   └── ci.yml         # Main CI pipeline
│   ├── ISSUE_TEMPLATE/    # Issue templates
│   └── PULL_REQUEST_TEMPLATE.md # PR template
│
├── .kiro/                  # Kiro IDE configuration
│   ├── steering/          # AI steering rules
│   │   └── project-rules.md # Project-wide AI rules
│   └── specs/             # Kiro spec files
│
├── .husky/                 # Git hooks (Husky)
│   ├── pre-commit         # Pre-commit checks
│   └── pre-push           # Pre-push checks (includes build)
│
├── scripts/                # Utility scripts
│   ├── bundle-openapi.sh  # Bundle OpenAPI modules
│   ├── validate-openapi.sh # Validate OpenAPI spec
│   ├── sync-openapi.sh    # Sync OpenAPI changes
│   ├── check-ai-docs.sh   # Validate AI docs
│   ├── pre-commit.js      # Pre-commit hook script
│   ├── pre-push.js        # Pre-push hook script
│   └── README.md          # Scripts documentation
│
├── generated/              # Generated courseware files (gitignored)
├── uploads/                # Uploaded files (gitignored)
├── templates/              # Empty templates directory
│
├── .cursorrules            # Root-level AI rules (global)
├── .gitignore              # Git ignore patterns
├── .editorconfig           # Editor configuration
├── .nvmrc                  # Node version specification
├── .npmrc                  # NPM configuration
├── .redocly.yaml           # Redocly OpenAPI config
├── docker-compose.yml      # Docker Compose configuration
├── package.json            # Root package.json (OpenAPI tools)
├── LICENSE                 # CC BY-NC 4.0 License
├── SECURITY.md             # Security policy
└── README.md               # This file
```

## Tech Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn/ui + Radix UI
- **State Management**: Zustand
- **Form Handling**: React Hook Form + Zod
- **Animations**: Framer Motion
- **Icons**: Lucide React

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.11
- **ORM**: Prisma Client Python
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **Authentication**: JWT
- **AI Integration**: LiteLLM (multi-model support)
- **Vector Database**: ChromaDB
- **Document Parsing**: LlamaParse

### DevOps
- **CI/CD**: GitHub Actions
- **Testing**: Jest (frontend), pytest (backend)
- **Code Quality**: ESLint, Prettier, Black, Flake8, isort
- **Containerization**: Docker + Docker Compose

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (optional, recommended)

### Using Docker (Recommended)

```bash
# Clone repository
git clone <repository-url>
cd Spectra

# Start all services
docker-compose up
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

See [Docker Setup Guide](./docs/guides/docker-setup.md) for details.

### Local Development

#### Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Configure environment
cp .env.example .env
# Edit .env and add your API keys

# Generate Prisma client
prisma generate

# Run migrations
prisma migrate dev

# Start server
python main.py
```

Backend will be available at http://localhost:8000

For OpenAPI development workflow, see [backend/OPENAPI_WORKFLOW.md](./backend/OPENAPI_WORKFLOW.md)

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local

# Start development server
npm run dev
```

Frontend will be available at http://localhost:3000

## Features

### Current Implementation (Phase 3 - Scaffolding)

- ✅ **Authentication System** - User registration and login (skeleton)
- ✅ **Project Management** - Create and manage courseware projects
- ✅ **File Upload** - Drag-and-drop file upload with validation
- ✅ **API Architecture** - RESTful API with `/api/v1` prefix
- ✅ **Database Schema** - Complete data models with Prisma ORM
- ✅ **Error Handling** - Unified error responses and logging
- ✅ **CI/CD Pipeline** - Automated testing and code quality checks

### Planned Features (Phase 4+)

- 🔄 **AI Chat Interface** - Natural conversation for courseware design
- 🔄 **Document Parsing** - Extract content from PDFs, DOCX, videos
- 🔄 **RAG Search** - Knowledge base retrieval for content generation
- 🔄 **Courseware Generation** - AI-powered slide and lesson plan creation
- 🔄 **Preview & Editing** - Real-time preview with modification support
- 🔄 **Multi-format Export** - Export to PPT, PDF, Word formats

## API Endpoints

All API endpoints are prefixed with `/api/v1`:

- **Authentication**: `/api/v1/auth/*` - User registration, login, profile
- **Projects**: `/api/v1/projects` - Project CRUD operations
- **Files**: `/api/v1/files` - File upload and management
- **Chat**: `/api/v1/chat/*` - Conversational interface
- **Generation**: `/api/v1/generate/*` - AI courseware generation
- **Preview**: `/api/v1/preview/*` - Preview and modification
- **RAG**: `/api/v1/rag/*` - Knowledge base search

See [OpenAPI Specification](./docs/openapi.yaml) for complete API documentation (auto-generated from modular files in `docs/openapi/`).

## AI Collaboration

> **AI 快速开始**: 请先阅读 [`.ai/CONTEXT.md`](./.ai/CONTEXT.md) 获取完整项目上下文

This project is optimized for AI-assisted development with a dedicated `.ai/` directory:

### For AI Tools

1. **Start here**: Read [`.ai/CONTEXT.md`](./.ai/CONTEXT.md) - Your single entry point
2. **Find guides**: Check [`.ai/guides/`](./.ai/guides/) for task-specific instructions
3. **Get help**: See [`.ai/FAQ.md`](./.ai/FAQ.md) for common questions
4. **Verify understanding**: Use [`.ai/self-check.md`](./.ai/self-check.md) to validate your knowledge

### Key Features

- **Single Entry Point**: `.ai/CONTEXT.md` provides complete project overview
- **Task-Driven Guides**: Step-by-step instructions for common tasks
- **Progressive Loading**: Start with overview, dive deeper as needed
- **Tool-Agnostic**: Standard Markdown format works with any AI tool
- **Token-Optimized**: Core context <1000 tokens, detailed guides on-demand

### Directory-Specific Rules

The project also maintains `.cursorrules` files for backward compatibility:

- **Root** (`.cursorrules`) - Project-wide rules and priorities
- **Frontend** (`frontend/.cursorrules`) - Next.js + TypeScript specifics
- **Backend** (`backend/.cursorrules`) - FastAPI + Python specifics
- **Docs** (`docs/.cursorrules`) - Documentation standards

**Usage**: AI tools automatically apply directory-specific rules for precise code suggestions.

## Development Standards

> **Important**: Read [Contributing Guide (docs/CONTRIBUTING.md)](./docs/CONTRIBUTING.md) before starting

- [Frontend Standards](./docs/standards/frontend.md)
- [Backend Standards](./docs/standards/backend.md)
- [Git Standards](./docs/standards/git.md)
- [Documentation Standards](./docs/standards/documentation.md)

## CI/CD

Automated continuous integration with GitHub Actions:

### What Triggers CI

CI runs on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### What Doesn't Trigger CI

To optimize build times, CI skips when only these files change:
- Documentation files (`*.md`, `docs/**`)
- AI/IDE configuration (`.cursorrules`, `.kiro/**`, `.ai/**`, `.vscode/**`)
- Git configuration (`.gitignore`, `.editorconfig`)
- Generated/temporary files (`generated/**`, `uploads/**`, `templates/**`)
- Editor files (`.DS_Store`)
- Non-code config files (`.nvmrc`, `.npmrc`, `.dockerignore`)

### CI Pipeline

**Frontend checks**:
- Code formatting (Prettier)
- Linting (ESLint)
- Unit tests (Jest) - 8 tests
- Production build

**Backend checks**:
- Code formatting (Black)
- Import sorting (isort)
- Linting (Flake8)
- Unit tests (pytest) - 188 tests
- Prisma schema validation

### Local Git Hooks

**Pre-commit** (runs on `git commit`):
- Frontend: format check, lint, tests
- Backend: format check, import sorting, lint, tests

**Pre-push** (runs on `git push`):
- All pre-commit checks
- Frontend: production build
- Backend: Prisma client generation

See [CI/CD Guide](./docs/guides/ci-cd.md) and [Testing Guide](./docs/guides/testing.md) for details.

## Documentation

- [Project Requirements](./docs/project/requirements.md)
- [Architecture Design](./docs/architecture/)
- [Technical Decisions](./docs/decisions/)
- [Development Guides](./docs/guides/)
- [Coding Standards](./docs/standards/)

## Monorepo Advantages

Compared to the previous submodule approach, the current monorepo structure provides:

1. **Unified Version Control**: All code in a single Git repository
2. **Simplified Dependencies**: No need to manage submodule updates
3. **Atomic Commits**: Cross-project changes in a single commit
4. **Better AI Collaboration**: Dedicated .cursorrules per directory
5. **Simplified CI/CD**: Unified build and deployment pipeline

## Git Workflow

```bash
# Clone project
git clone <repository-url>
cd Spectra

# Create feature branch
git checkout -b feat/your-feature

# Commit code (follow commit conventions)
git add .
git commit -m "feat(frontend): add new feature"

# Push to remote
git push origin feat/your-feature
```

## Verify Setup

```bash
# Using Docker
docker-compose up

# Or verify manually
ls -la  # Check directory structure
cd frontend && npm install && npm run build
cd ../backend && pip install -r requirements.txt && prisma generate
```

## License

This project is licensed under the [Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/).

- ✅ Free to use, copy, and modify
- ✅ Attribution required
- ❌ **Commercial use prohibited**
