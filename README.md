# Spectra - Multimodal AI Teaching Assistant

[![CI](https://github.com/ln-one/Spectra/actions/workflows/ci.yml/badge.svg)](https://github.com/ln-one/Spectra/actions/workflows/ci.yml)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[快速开始](./docs/guides/getting-started.md)
An AI-powered intelligent courseware generation system that helps educators quickly create high-quality multimodal teaching materials through natural conversation.

## Project Structure

```
Spectra/                 # Monorepo root
├── frontend/            # Next.js frontend app
│   ├── app/            # Page routes
│   ├── components/     # React components
│   ├── lib/            # Utility functions
│   └── .cursorrules    # Frontend AI rules
├── backend/             # FastAPI backend service
│   ├── routers/        # API routes
│   ├── services/       # Business logic
│   ├── schemas/        # Data models
│   ├── prisma/         # Database ORM
│   └── .cursorrules    # Backend AI rules
├── docs/                # Project documentation
│   ├── project/        # Project basics
│   ├── standards/      # Standards & specs
│   ├── architecture/   # Architecture design
│   ├── decisions/      # Technical decisions
│   ├── requirements/   # Requirements analysis
│   ├── guides/         # Development guides
│   └── .cursorrules    # Docs AI rules
├── .cursorrules         # Root AI rules
├── .gitignore          # Git ignore config
└── README.md           # This file
```

## Tech Stack

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS + Shadcn/ui
- **Backend**: FastAPI + Python 3.11 + Prisma ORM
- **Database**: SQLite
- **AI**: LiteLLM (multi-model support)

## Quick Start

### Using Docker (Recommended)

```bash
docker-compose up
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

See [Docker Setup Guide](./docs/guides/docker-setup.md) for details.

### Local Development

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env
prisma generate
prisma db push
uvicorn main:app --reload
```

## AI Collaboration Optimization

This project is optimized for AI-assisted development with dedicated `.cursorrules` in each directory:

### Root Directory (Spectra/)
- General specs and project structure
- Cross-project collaboration guide
- Suitable for architects and project managers

### Frontend Directory (frontend/)
- Next.js + TypeScript specific rules
- Component development best practices
- Backend API integration guide
- Optimized for frontend engineers

### Backend Directory (backend/)
- FastAPI + Python specific rules
- API design and database operations
- Async programming standards
- Optimized for backend engineers

### Docs Directory (docs/)
- Markdown documentation standards
- Architecture diagrams and ADR templates
- Optimized for technical writing and architecture design

**Usage**: When working in a specific directory, AI tools automatically apply that directory's rules for more precise code suggestions and standard checks.

## Development Standards

> **Important**: Read [Contributing Guide (docs/CONTRIBUTING.md)](./docs/CONTRIBUTING.md) before starting

- [Frontend Standards](./docs/standards/frontend.md)
- [Backend Standards](./docs/standards/backend.md)
- [Git Standards](./docs/standards/git.md)
- [Documentation Standards](./docs/standards/documentation.md)

## CI/CD

Automated continuous integration with GitHub Actions:
- Code quality checks (ESLint, Black, Flake8)
- Build verification
- Documentation changes don't trigger CI

See [CI/CD Guide](./docs/guides/ci-cd.md) for details.

## Documentation

- [Project Requirements](./docs/project/requirements.md)
- [Tech Stack](./docs/project/tech-stack.md)
- [Architecture Design](./docs/architecture/)
- [Technical Decisions](./docs/decisions/)
- [Docker Setup Guide](./docs/guides/docker-setup.md)
- [CI/CD Guide](./docs/guides/ci-cd.md)

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
