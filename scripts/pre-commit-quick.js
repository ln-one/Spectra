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

console.log('🚀 Running quick pre-commit checks (no tests)...\n');

// Frontend checks
console.log('📦 Frontend checks...');
console.log('  ├─ Auto-formatting...');
if (!runCommand('npm run format', frontendDir)) {
  console.error('  ✗ Frontend formatting failed');
  process.exit(1);
}

console.log('  ├─ Linting...');
if (!runCommand('npm run lint', frontendDir)) process.exit(1);

// Backend checks
console.log('\n🐍 Backend checks...');
console.log('  ├─ Auto-formatting (black)...');
if (!runCommand(`${blackCmd} .`, backendDir)) {
  console.error('  ✗ Backend formatting (black) failed');
  process.exit(1);
}

console.log('  ├─ Auto-sorting imports (isort)...');
if (!runCommand(`${isortCmd} .`, backendDir)) {
  console.error('  ✗ Import sorting (isort) failed');
  process.exit(1);
}

console.log('  ├─ Linting (flake8)...');
if (!runCommand(`${flake8Cmd} .`, backendDir)) process.exit(1);

console.log('\n✅ Quick checks passed! (tests skipped)');
console.log('💡 Run full checks before push: npm run pre-commit:full');
