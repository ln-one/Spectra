#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const runCommand = (command, cwd) => {
    try {
        execSync(command, {
            cwd,
            stdio: 'inherit',
            shell: true
        });
        return true;
    } catch (error) {
        return false;
    }
};

const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');
const venvBinDir =
    process.platform === 'win32'
        ? path.join(rootDir, '.venv', 'Scripts')
        : path.join(rootDir, '.venv', 'bin');

const resolveVenvTool = (name, fallback = name) => {
    const candidate = path.join(venvBinDir, name);
    if (fs.existsSync(candidate)) {
        return candidate;
    }
    return fallback;
};

const blackCmd = resolveVenvTool('black');
const isortCmd = resolveVenvTool('isort');
const flake8Cmd = resolveVenvTool('flake8');
const pytestCmd = resolveVenvTool('pytest');

console.log('🔍 Running pre-commit checks...\n');

// Frontend checks
console.log('📦 Frontend checks...');
console.log('  ├─ Auto-formatting...');
if (!runCommand('npm run format', frontendDir)) process.exit(1);

// Add formatted files back to staging area
console.log('  ├─ Adding formatted files to staging...');
if (!runCommand('git add frontend/', rootDir)) process.exit(1);

console.log('  ├─ Linting...');
if (!runCommand('npm run lint', frontendDir)) process.exit(1);

console.log('  ├─ Running tests...');
if (!runCommand('npm test', frontendDir)) process.exit(1);

// Backend checks
console.log('\n🐍 Backend checks...');
console.log('  ├─ Auto-formatting code (black)...');
if (!runCommand(`${blackCmd} .`, backendDir)) process.exit(1);

console.log('  ├─ Auto-sorting imports (isort)...');
if (!runCommand(`${isortCmd} .`, backendDir)) process.exit(1);

// Add formatted files back to staging area
console.log('  ├─ Adding formatted files to staging...');
if (!runCommand('git add backend/', rootDir)) process.exit(1);

console.log('  ├─ Linting (flake8)...');
if (!runCommand(`${flake8Cmd} .`, backendDir)) process.exit(1);

console.log('  ├─ Running tests...');
if (!runCommand(`${pytestCmd} -m "not integration and not slow"`, backendDir)) process.exit(1);

// OpenAPI checks (repo root)
console.log('\n📄 OpenAPI checks...');
console.log('  ├─ Bundle (source)...');
if (!runCommand('npm run bundle:openapi', rootDir)) process.exit(1);
console.log('  ├─ Lint (source)...');
if (!runCommand('npm run validate:openapi', rootDir)) process.exit(1);
console.log('  ├─ Bundle (target)...');
if (!runCommand('npm run bundle:openapi:target', rootDir)) process.exit(1);
console.log('  ├─ Lint (target)...');
if (!runCommand('npm run validate:openapi:target', rootDir)) process.exit(1);
console.log('  ├─ Contract alignment (requires backend on :8000)...');
if (!runCommand('node scripts/validate-contract-target.js', rootDir)) process.exit(1);

// Check if any files were formatted during the hook execution and add them
console.log('  ├─ Adding any remaining formatted files...');
if (!runCommand('git add .', rootDir)) process.exit(1);

console.log('\n✅ All checks passed!');
