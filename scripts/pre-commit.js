#!/usr/bin/env node
const { execSync } = require('child_process');
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

const frontendDir = path.join(__dirname, '..', 'frontend');
const backendDir = path.join(__dirname, '..', 'backend');

console.log('🔍 Running pre-commit checks...\n');

// Frontend checks
console.log('📦 Frontend checks...');
console.log('  ├─ Checking format...');
if (!runCommand('npm run format:check', frontendDir)) process.exit(1);

console.log('  ├─ Linting...');
if (!runCommand('npm run lint', frontendDir)) process.exit(1);

console.log('  ├─ Running tests...');
if (!runCommand('npm test', frontendDir)) process.exit(1);

// Backend checks
console.log('\n🐍 Backend checks...');
console.log('  ├─ Checking code format (black)...');
if (!runCommand('black --check .', backendDir)) process.exit(1);

console.log('  ├─ Checking import sorting (isort)...');
if (!runCommand('isort --check .', backendDir)) process.exit(1);

console.log('  ├─ Linting (flake8)...');
if (!runCommand('flake8 . --max-line-length=88 --extend-ignore=E203', backendDir)) process.exit(1);

console.log('  ├─ Running tests...');
if (!runCommand('pytest', backendDir)) process.exit(1);

console.log('\n✅ All checks passed!');
