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

console.log('🚀 Running pre-push checks (includes build)...\n');

// Frontend checks
console.log('📦 Frontend checks...');
console.log('  ├─ Building...');
if (!runCommand('npm run build', frontendDir)) {
  console.error('\n❌ Frontend build failed!');
  process.exit(1);
}

// Backend checks
console.log('\n🐍 Backend checks...');
console.log('  ├─ Checking Prisma schema...');
if (!runCommand('prisma validate', backendDir)) {
  console.error('\n❌ Prisma schema validation failed!');
  process.exit(1);
}

console.log('  ├─ Generating Prisma client...');
if (!runCommand('prisma generate', backendDir)) {
  console.error('\n❌ Prisma client generation failed!');
  process.exit(1);
}

console.log('\n✅ All pre-push checks passed!');
console.log('💡 Safe to push to remote');
