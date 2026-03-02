# 安全漏洞修复指南

## 检测到的漏洞

### 1. python-jose 漏洞（Critical + Moderate）
- **CVE**: ECDSA 密钥混淆 + JWE 压缩内容 DoS
- **影响**: backend/requirements.txt
- **状态**: 已修复

### 2. minimatch ReDoS 漏洞（High）
- **CVE**: 通过重复通配符导致 ReDoS
- **影响**: frontend/package-lock.json
- **状态**: 需要手动修复

---

## 修复步骤

### Backend (Python)

已将 `python-jose` 替换为 `PyJWT`：

```bash
cd backend
pip install -r requirements.txt
```

**注意**: 如果项目中使用了 `python-jose`，需要更新代码：

```python
# 旧代码 (python-jose)
from jose import jwt

# 新代码 (PyJWT)
import jwt
```

主要 API 变化：
- `jwt.encode()` - 相同
- `jwt.decode()` - 相同
- 需要显式指定算法: `algorithms=["HS256"]`

### Frontend (Node.js)

修复 `minimatch` 漏洞：

```bash
cd frontend

# 方法 1: 更新所有依赖
npm update

# 方法 2: 强制更新 minimatch
npm install minimatch@latest --save-dev

# 方法 3: 使用 npm audit 自动修复
npm audit fix

# 如果需要强制修复（可能有破坏性变更）
npm audit fix --force

# 重新生成 package-lock.json
rm package-lock.json
npm install
```

---

## 验证修复

### Backend

```bash
cd backend
pip list | grep -i jwt
# 应该看到 PyJWT 而不是 python-jose
```

### Frontend

```bash
cd frontend
npm list minimatch
# 应该显示 >= 3.1.2 或更高版本
```

---

## 后续建议

### 1. 定期更新依赖

```bash
# Backend
pip list --outdated

# Frontend
npm outdated
```

### 2. 启用自动安全更新

在 GitHub 仓库设置中启用 Dependabot：
- Settings → Security → Dependabot
- 启用 "Dependabot security updates"

### 3. 添加安全扫描到 CI/CD

```yaml
# .github/workflows/security.yml
name: Security Scan

on: [push, pull_request]

jobs:
 security:
 runs-on: ubuntu-latest
 steps:
 - uses: actions/checkout@v3
 
 # Python 安全扫描
 - name: Python Security Check
 run: |
 pip install safety
 safety check -r backend/requirements.txt
 
 # Node.js 安全扫描
 - name: Node Security Check
 run: |
 cd frontend
 npm audit
```

---

## 紧急联系

如果发现新的安全漏洞：
1. 立即在 GitHub Issues 中报告
2. 标记为 `security` 标签
3. 通知团队负责人

---

## 参考链接

- [python-jose 漏洞详情](https://github.com/advisories/GHSA-6jvc-q2x7-pchv)
- [minimatch 漏洞详情](https://github.com/advisories/GHSA-f8q6-p94x-37v3)
- [PyJWT 文档](https://pyjwt.readthedocs.io/)
- [npm audit 文档](https://docs.npmjs.com/cli/v8/commands/npm-audit)
