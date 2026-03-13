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

const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');

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

// OpenAPI contract checks
console.log('\n📄 OpenAPI checks...');
console.log('  ├─ Bundle (source)...');
if (!runCommand('npm run bundle:openapi', rootDir)) {
  console.error('\n❌ OpenAPI bundle failed!');
  process.exit(1);
}
console.log('  ├─ Lint (source)...');
if (!runCommand('npm run validate:openapi', rootDir)) {
  console.error('\n❌ OpenAPI lint failed!');
  process.exit(1);
}
console.log('  ├─ Bundle (target)...');
if (!runCommand('npm run bundle:openapi:target', rootDir)) {
  console.error('\n❌ OpenAPI target bundle failed!');
  process.exit(1);
}
console.log('  ├─ Lint (target)...');
if (!runCommand('npm run validate:openapi:target', rootDir)) {
  console.error('\n❌ OpenAPI target lint failed!');
  process.exit(1);
}
console.log('  ├─ Contract alignment (requires backend on :8000)...');
if (!runCommand('node scripts/validate-contract-target.js', rootDir)) {
  console.error('\n❌ Contract alignment failed!');
  process.exit(1);
}

console.log('\n✅ All pre-push checks passed!');
console.log('💡 Safe to push to remote');
