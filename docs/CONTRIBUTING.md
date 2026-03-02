# Contributing Guide

> Core guidelines - All team members and AI tools must strictly follow

## Architecture Philosophy

See [Architecture Philosophy (architecture/PHILOSOPHY.md)](./architecture/PHILOSOPHY.md)

Core Principles:
- **Contract-First**: Contract-first development
- **SSOT**: Single Source of Truth
- **Separation of Concerns**: Clear responsibility boundaries
- **DRY**: Don't Repeat Yourself

## AI Collaboration

See [AI Collaboration Standards (standards/AI_COLLABORATION.md)](./standards/AI_COLLABORATION.md)

**Self-Learning Mechanism**: AI should learn from feedback, proactively update standards, and form a self-evolution loop.

## Three Core Guidelines

### 1. Repository & Branch Security

**Main Branch Protection**:
- Direct push to main is prohibited
- All changes must be merged via PR
- Use Squash Merge consistently

**PR Requirements**:
- At least 1 reviewer approval
- Pass CI checks (Lint/Build/Test)
- No conflicts

### 2. AI-Friendly Documentation Standards

**Document Format**:
- Use Markdown (.md) for all internal documentation
- External deliverables (Word/PDF) are exported from MD
- Binary documents that cannot be diffed are prohibited

**Logic Diagrams**:
- Use Mermaid.js source code for flowcharts and architecture diagrams
- Screenshots are prohibited

**Visual Assets**:
- Use Lucide React for icons
- Store logos/vectors as SVG source code
- Bitmap formats (PNG/JPG) are prohibited

### 3. Modular & Atomic Decoupling Protocol

**Complexity Threshold**:
- Code files: Must split if >300 lines
- Documentation: Must split if >6000 characters

**Evolution Pattern**:

When functionality complexity increases, adopt "folder as module" pattern:

```
# Original
AuthModule.ts

# After splitting
AuthModule/
├── index.ts # Orchestrator
├── Logic.ts # Business logic
├── UI.tsx # UI components
└── Types.ts # Type definitions
```

Index file serves only as orchestrator:
```typescript
// AuthModule/index.ts
export { AuthLogic } from './Logic'
export { AuthUI } from './UI'
export type { AuthTypes } from './Types'
```

## Quick Reference

### Commit Format
```
<type>(<scope>): <subject>
```

Type: `feat` | `fix` | `refactor` | `docs` | `style` | `test` | `chore`

Examples:
```bash
feat(chat): add streaming response support
fix(upload): fix large file upload failure
docs(readme): update installation guide
```

### Development Workflow
```bash
# 1. Create branch
git checkout -b feat/feature-name

# 2. Develop and test
# Run tests before committing
cd frontend && npm test
cd ../backend && pytest

# 3. Commit following conventions
git commit -m "feat(scope): description"

# 4. Push and create PR
git push origin feat/feature-name
```

### Prohibited Actions
- Direct push to main
- Using binary documents as source files
- Pasting screenshots instead of Mermaid diagrams
- Exceeding complexity threshold in single files
- Committing sensitive information

## Detailed Standards

- [Frontend Standards](./standards/frontend.md) - Frontend code and component conventions
- [Backend Standards](./standards/backend.md) - Backend code and API conventions
- [Git Standards](./standards/git.md) - Branch strategy, commit, PR conventions
- [Documentation Standards](./standards/documentation.md) - Markdown, Mermaid, document structure
- [Testing Guide](./guides/testing.md) - Unit tests, integration tests, CI/CD testing

## Related Documentation

- [Tech Stack](./architecture/tech-stack.md)
- [Project Requirements](./project/requirements.md)
- [Technical Decisions](./decisions/)

---

These standards are designed to enable more efficient collaboration between team members and AI, maintaining a healthy and maintainable codebase.
