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
console.log('  ├─ Auto-formatting...');
if (!runCommand('npm run format', frontendDir)) process.exit(1);

console.log('  ├─ Linting...');
if (!runCommand('npm run lint', frontendDir)) process.exit(1);

console.log('  ├─ Running tests...');
if (!runCommand('npm test', frontendDir)) process.exit(1);

// Backend checks
console.log('\n🐍 Backend checks...');
console.log('  ├─ Auto-formatting code (black)...');
if (!runCommand('black .', backendDir)) process.exit(1);

console.log('  ├─ Auto-sorting imports (isort)...');
if (!runCommand('isort .', backendDir)) process.exit(1);

console.log('  ├─ Linting (flake8)...');
if (!runCommand('flake8 .', backendDir)) process.exit(1);

console.log('  ├─ Running tests...');
if (!runCommand('pytest', backendDir)) process.exit(1);

console.log('\n✅ All checks passed!');
