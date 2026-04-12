#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

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
const prismaCmd = resolveVenvTool('prisma');

const CONTRACT_HEALTH_URL =
  process.env.CONTRACT_ALIGNMENT_HEALTH_URL || 'http://localhost:8000/health';
const CONTRACT_CHECK_TIMEOUT_MS = Number.parseInt(
  process.env.CONTRACT_ALIGNMENT_TIMEOUT_MS || '800',
  10
);

const isBackendReachable = (url, timeoutMs) =>
  new Promise((resolve) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      resolve(false);
      return;
    }
    const client = target.protocol === 'https:' ? https : http;
    const req = client.get(target, (res) => {
      res.resume();
      resolve(Boolean(res.statusCode && res.statusCode < 500));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });

const main = async () => {
  console.log('🚀 Running pre-push checks (includes build)...\n');

// Frontend checks
console.log('📦 Frontend checks...');
const frontendChecks = [
  ['Linting...', 'npm run lint', 'Frontend lint failed!'],
  ['Checking formatting...', 'npm run format:check', 'Frontend format check failed!'],
  ['Running tests...', 'npm test', 'Frontend tests failed!'],
  ['Building...', 'npm run build', 'Frontend build failed!'],
];

for (const [label, command, failureMessage] of frontendChecks) {
  console.log(`  ├─ ${label}`);
  if (!runCommand(command, frontendDir)) {
    console.error(`\n❌ ${failureMessage}`);
    process.exit(1);
  }
}

// Backend checks
console.log('\n🐍 Backend checks...');
console.log('  ├─ Checking Prisma schema...');
if (!runCommand(`${prismaCmd} validate`, backendDir)) {
  console.error('\n❌ Prisma schema validation failed!');
  process.exit(1);
}

console.log('  ├─ Generating Prisma client...');
if (!runCommand(`${prismaCmd} generate`, backendDir)) {
  console.error('\n❌ Prisma client generation failed!');
  process.exit(1);
}

console.log('  ├─ Checking code format (black --check)...');
if (!runCommand(`${blackCmd} --check .`, backendDir)) {
  console.error('\n❌ Backend formatting check failed!');
  process.exit(1);
}

console.log('  ├─ Checking import sorting (isort --check)...');
if (!runCommand(`${isortCmd} --check .`, backendDir)) {
  console.error('\n❌ Backend import sorting check failed!');
  process.exit(1);
}

console.log('  ├─ Linting (flake8)...');
if (!runCommand(`${flake8Cmd} . --max-line-length=88 --extend-ignore=E203`, backendDir)) {
  console.error('\n❌ Backend lint failed!');
  process.exit(1);
}

console.log('  ├─ Running tests...');
if (!runCommand(`${pytestCmd} -m "not integration and not slow"`, backendDir)) {
  console.error('\n❌ Backend tests failed!');
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
if (process.env.SKIP_CONTRACT_ALIGNMENT === '1') {
  console.log('  ├─ Contract alignment skipped (SKIP_CONTRACT_ALIGNMENT=1)');
} else {
  const reachable = await isBackendReachable(
    CONTRACT_HEALTH_URL,
    CONTRACT_CHECK_TIMEOUT_MS
  );
  if (!reachable) {
    console.log(
      `  ├─ Contract alignment skipped (backend not reachable at ${CONTRACT_HEALTH_URL})`
    );
  } else {
    console.log('  ├─ Contract alignment (requires backend on :8000)...');
    if (!runCommand('node scripts/validate-contract-target.js', rootDir)) {
      console.error('\n❌ Contract alignment failed!');
      process.exit(1);
    }
  }
}

console.log('\n✅ All pre-push checks passed!');
console.log('💡 Safe to push to remote');
};

main().catch((error) => {
  console.error('\n❌ Pre-push checks failed.');
  if (error) {
    console.error(error);
  }
  process.exit(1);
});
