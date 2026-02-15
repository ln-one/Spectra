# Spectra - Multimodal AI Teaching Assistant

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

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:3000

### Backend Development

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
prisma generate
prisma db push
uvicorn main:app --reload
```

Visit http://localhost:8000

API Docs: http://localhost:8000/docs

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

## Documentation

- [Project Requirements](./docs/project/requirements.md)
- [Tech Stack](./docs/project/tech-stack.md)
- [Architecture Design](./docs/architecture/)
- [Technical Decisions](./docs/decisions/)
- [Development Guides](./docs/guides/)

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

## Verify Monorepo Setup

```bash
# Check directory structure
ls -la
# Should see: frontend/ backend/ docs/ .cursorrules .gitignore

# Check Git status
git status
# Should be a clean Git repository

# Verify frontend
cd frontend && npm install && npm run build

# Verify backend
cd ../backend && pip install -r requirements.txt && prisma generate

# Verify docs
cd ../docs && ls -la
```

## License

MIT
