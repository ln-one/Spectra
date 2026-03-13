#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');

let yaml;
try {
  yaml = require('yaml');
} catch (err) {
  console.error('❌ 缺少依赖: yaml。请先运行: npm install');
  process.exit(1);
}

const repoRoot = path.join(__dirname, '..');
const targetPath = path.join(repoRoot, 'docs', 'openapi-target.yaml');

const fetchJson = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const { statusCode } = res;
        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${statusCode}`));
        }
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });

const pathMethodSet = (spec) => {
  const pairs = new Set();
  const paths = spec.paths || {};
  for (const [p, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue;
    for (const method of Object.keys(methods)) {
      if (method.startsWith('x-')) continue;
      pairs.add(`${method.toLowerCase()} ${p}`);
    }
  }
  return pairs;
};

const legacyIgnore = new Set([
  'get /',
]);

(async () => {
  console.log('🧭 校验实现是否对齐 OpenAPI Target...');

  let targetYaml;
  try {
    targetYaml = fs.readFileSync(targetPath, 'utf8');
  } catch (err) {
    console.error('❌ 找不到 docs/openapi-target.yaml，请先打包目标契约');
    process.exit(1);
  }

  let targetSpec;
  try {
    targetSpec = yaml.parse(targetYaml);
  } catch (err) {
    console.error('❌ 解析 OpenAPI Target 失败:', err.message);
    process.exit(1);
  }

  let liveSpec;
  try {
    liveSpec = await fetchJson('http://localhost:8000/openapi.json');
  } catch (err) {
    console.error('❌ 无法获取 FastAPI OpenAPI:', err.message);
    console.error('   请确认后端已启动: cd backend && uvicorn main:app --reload');
    process.exit(1);
  }

  const livePairs = pathMethodSet(liveSpec);
  const targetPairs = pathMethodSet(targetSpec);

  const missing = [...livePairs]
    .filter((p) => !targetPairs.has(p))
    .filter((p) => !legacyIgnore.has(p))
    .sort();
  if (missing.length) {
    console.error('❌ 发现实现中存在但 Target 未声明的接口：');
    for (const item of missing) {
      const [method, p] = item.split(' ');
      console.error(`  - ${method.toUpperCase()} ${p}`);
    }
    process.exit(1);
  }

  const extra = [...targetPairs].filter((p) => !livePairs.has(p));
  console.log(`✅ 实现接口全部被 Target 覆盖: ${livePairs.size} 个`);
  console.log(`ℹ️  Target 比实现多 ${extra.length} 个接口（允许，代表规划中）`);
})();
