# Code Quality Guide

## Frontend

### Prettier (Code Formatting)

Auto-format code:
```bash
cd frontend
npm run format
```

Check formatting:
```bash
npm run format:check
```

### ESLint (Code Quality)

Run linting:
```bash
npm run lint
```

Fix auto-fixable issues:
```bash
npm run lint -- --fix
```

### Rules
- No console.log (use console.warn/error)
- Unused variables prefixed with `_` are allowed
- TypeScript `any` triggers warning
- React hooks dependencies checked

## Backend

### Black (Code Formatting)

Format code:
```bash
cd backend
black .
```

Check formatting:
```bash
black --check .
```

### Flake8 (Code Quality)

Run linting:
```bash
flake8 .
```

### isort (Import Sorting)

Sort imports:
```bash
isort .
```

Check imports:
```bash
isort --check .
```

### Configuration
- Line length: 88 characters
- Python 3.11 target
- Black-compatible settings

## Editor Integration

### VS Code

Install extensions:
- ESLint
- Prettier
- Python (with Black formatter)

Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter"
  },
  "python.linting.flake8Enabled": true,
  "python.linting.enabled": true
}
```

## Pre-commit Hooks (Optional)

Install husky:
```bash
cd frontend
npm install --save-dev husky
npx husky install
```

Hooks will run automatically before commits.

## CI Integration

GitHub Actions automatically checks:
- Frontend: ESLint + Prettier + Build
- Backend: Black + Flake8

See [CI/CD Guide](./ci-cd.md) for details.
