# Main 分支部署 Runbook

## 更新日期

- 2026-03-19

## 目标

这份 runbook 用于约束演示环境的发布流程：

- 线上只部署 `main`
- 发布步骤可重复
- 出问题时可快速定位和回滚

本文档面向当前阶段的轻量部署：

- Docker / Docker Compose
- 多机分职责部署
- 以指导老师演示和团队验证为主

---

## 一、发布原则

1. 线上环境只认 `main`
2. feature 分支不直接部署到演示环境
3. 合并到 `main` 前必须通过：
   - 主测试套
   - OpenAPI bundle / lint
   - contract alignment
4. 发布必须记录：
   - commit id
   - 发布时间
   - 发布人
   - 是否涉及 schema / env / topology 变化

建议生成一份发布记录：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deploy_release_record.py \
  --operator <name> \
  --notes "Short rollout summary"
```

---

## 二、发布前检查

### 代码侧

1. 确认当前提交已在 `main`
2. 记录待发布 commit：

```bash
git rev-parse HEAD
```

3. 在本地或 CI 确认以下检查通过：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py
```

以及：
- frontend format / lint / test
- backend pytest 主套
- OpenAPI source / target 校验

### 环境侧

1. 确认服务器磁盘空间足够
2. 确认容器运行状态正常
3. 确认关键环境变量已配置：
- 数据库
- Redis
- DashScope
- JWT secret
4. 若涉及 schema 变更，先确认 migration 策略

建议先跑一遍部署前置检查：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deploy_preflight.py
```

如果要先审分布式 / Docker readiness：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/docker_deploy_readiness_audit.py
```

如果只想先看环境变量是否齐全：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deploy_preflight.py --skip-network
```

如果要先生成发布记录骨架：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deploy_release_record.py \
  --operator <name>
```

---

## 三、推荐发布顺序

### 方案 A：单机或少量机器

推荐顺序：

1. 拉取最新 `main`
2. 构建新镜像
3. 重启 backend
4. 重启 worker
5. 校验前端/API/健康状态

### 方案 B：多机职责拆分

推荐顺序：

1. `backend api`
2. `worker`
3. `frontend / reverse proxy`

原因：
- 先保证 API 与任务链路是新版本
- 最后切入口，减少用户看到半更新状态的时间

---

## 四、标准部署流程

### 1. 登录目标机器

```bash
ssh <user>@<host>
```

### 2. 进入项目目录

```bash
cd /path/to/Spectra
```

### 3. 拉取 `main`

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
```

### 4. 记录当前发布 commit

```bash
git rev-parse --short HEAD
```

### 5. 重建并启动

按实际部署方式执行，例如：

```bash
docker compose up -d --build
```

如果是分机部署，则按服务分开执行，例如：

```bash
docker compose up -d --build backend
docker compose up -d --build worker
docker compose up -d --build frontend
```

### 6. 检查容器状态

```bash
docker compose ps
```

### 7. 检查关键日志

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 worker
```

### 8. 检查健康状态

至少确认：
- 前端可打开
- `/health` 正常
- 登录链路正常
- 一个最核心的项目/会话接口正常

可以先跑轻量 smoke check：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deploy_smoke_check.py \
  --base-url http://localhost:8000
```

如果手头有演示环境 token，还可以补一条认证检查：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deploy_smoke_check.py \
  --base-url http://localhost:8000 \
  --token <bearer-token>
```

---

## 五、发布后检查

建议最少做这几项：

1. 打开首页
2. 登录
3. 打开一个已有项目
4. 获取 session snapshot / preview
5. 查看 worker 是否有异常堆积

如果发布包含生成链路改动，再补：

1. 创建一个新 session
2. 触发 outline draft
3. 确认不会卡死在 `DRAFTING_OUTLINE`

---

## 六、回滚流程

### 触发条件

出现以下任一情况即可回滚：

- backend 无法启动
- worker 持续报错
- `/health` 不通过
- 登录或核心项目链路不可用
- 生成主链路明显异常

### 回滚步骤

1. 找到上一个稳定 commit

```bash
git log --oneline -n 10
```

2. 切回该 commit 或稳定 tag

```bash
git checkout <stable-commit>
```

3. 重新构建并启动

```bash
docker compose up -d --build
```

4. 再做健康检查

### 注意

- 不要在服务器上做 `git reset --hard` 这种无记录回退
- 回滚后要补记：
  - 回滚原因
  - 出问题 commit
  - 现象
  - 待修复点

---

## 七、自动部署建议

如果后续启用自动部署，建议流程为：

1. GitHub Actions 在 `main` push 后触发
2. SSH 到目标机器
3. 执行：

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
docker compose up -d --build
```

4. 自动跑健康检查
5. 失败时通知，不自动盲目继续

当前阶段建议：
- 先半自动
- 再完全自动

---

## 八、发布记录模板

建议每次发布至少记录：

- 日期时间
- commit id
- 发布人
- 变更范围
- 是否涉及 migration
- 是否涉及 env 变更
- 发布结果
- 是否回滚

---

## 一句话结论

演示环境发布的核心不是“花哨自动化”，而是：

- 只发布 `main`
- 步骤固定
- 出问题能快速回滚
