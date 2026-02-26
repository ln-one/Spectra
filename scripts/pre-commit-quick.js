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
if (!runCommand('black .', backendDir)) {
  console.error('  ✗ Backend formatting (black) failed');
  process.exit(1);
}

console.log('  ├─ Auto-sorting imports (isort)...');
if (!runCommand('isort .', backendDir)) {
  console.error('  ✗ Import sorting (isort) failed');
  process.exit(1);
}

console.log('  ├─ Linting (flake8)...');
if (!runCommand('flake8 .', backendDir)) process.exit(1);

console.log('\n✅ Quick checks passed! (tests skipped)');
console.log('💡 Run full checks before push: npm run pre-commit:full');
