# 故障响应 Runbook

## 更新日期

- 2026-03-19

## 目标

当演示环境或轻量线上环境出问题时，用最短路径把问题分成：

- 入口问题
- API 问题
- worker 问题
- 数据服务问题
- 外部 provider 问题

目标不是一次性解释所有原因，而是：

- 先恢复可用性
- 再定位根因
- 最后记录复盘

---

## 一、常见故障分类

### 1. 页面打不开
可能位置：
- 前端容器
- reverse proxy
- 域名 / HTTPS

### 2. 页面能打开，但接口报错
可能位置：
- backend
- env 配置
- 数据库连接
- OpenAPI/接口实现漂移

### 3. 可以创建任务，但一直不出结果
可能位置：
- worker
- Redis / queue
- 外部模型调用超时
- session 状态未正确回写

### 4. 检索/引用异常
可能位置：
- ChromaDB
- embedding / rag indexing
- 上传解析链路

### 5. 单次生成偶发卡死
可能位置：
- provider 抖动
- worker timeout / retry
- session stuck 状态

---

## 二、第一响应动作

出现故障时，先做这四件事：

1. 确认是否是局部问题还是全局问题
2. 确认最近是否刚发布
3. 查看关键容器状态
4. 查看 backend / worker 最近日志

如果怀疑是发布后基础链路异常，先跑：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deploy_smoke_check.py \
  --base-url http://localhost:8000
```

命令示例：

```bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 worker
```

---

## 三、按故障类型排查

### A. 页面打不开

检查顺序：

1. reverse proxy 是否存活
2. frontend 容器是否存活
3. 域名解析是否仍指向正确机器
4. HTTPS 证书是否异常

优先恢复动作：

```bash
docker compose restart frontend
```

如果是入口代理异常，再重启代理层。

### B. `/health` 异常或接口 5xx

检查顺序：

1. backend 容器是否正常
2. env 是否缺失
3. DB / Redis / Chroma 是否可连
4. 最近发布是否引入 schema/env 漂移

优先恢复动作：

```bash
docker compose restart backend
```

如果刚发布过，且异常明显来自新版本，优先考虑回滚。

### C. Outline / generation 卡住

检查顺序：

1. worker 是否正常
2. Redis 队列是否可用
3. worker 日志里是否有 timeout / fallback / provider error
4. session 是否长期停在 `DRAFTING_OUTLINE` 或 `PROCESSING`
5. `stateReason` 是否与当前状态一致（例如成功态应为 `task_completed`）

优先恢复动作：

```bash
docker compose restart worker
```

当前代码已经支持：
- AI completion timeout
- outline timeout failure code
- task timeout failure code
- queue health unknown -> 单次重试 -> local fallback
- fresh worker / stale worker 分离判断

所以如果仍大量卡住，优先看：
- provider 可用性
- queue/stuck job
- worker 资源是否不足

日志排查重点：
- 上传链路：`parse_ms / normalize_ms / chunk_ms / embedding_ms / index_ms`
- 对话链路：`history_ms / rag_ms / ai_generate_ms / persist_ms`
- 生成链路：`content_generate_ms / render_ppt_ms / render_word_ms / persist_artifact_ms`

如果怀疑是多机 / Docker 拓扑本身的问题，也可以先跑：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/docker_deploy_readiness_audit.py
```

可以先直接跑：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/worker_queue_diagnose.py
```

它会快速告诉你：
- worker 是否可见
- started registry 里是否有疑似卡住任务
- failed registry 是否开始堆积
- high/default/low 队列积压情况

### D. 检索 / 引用异常

检查顺序：

1. Chroma 是否正常
2. 上传文件是否已成功解析和索引
3. embedding provider 是否退化
4. source detail / chunk 是否还存在

优先恢复动作：

```bash
docker compose restart chromadb
```

如果索引链路异常，需同时看 backend / worker 日志。

---

## 四、典型快速判断表

### 现象：老师打开页面没问题，但生成一直不结束
优先怀疑：
- worker
- provider timeout
- queue stuck

### 现象：登录失败或所有接口都 401/500
优先怀疑：
- backend
- JWT env
- 数据库连接

### 现象：文件上传成功，但检索不到内容
优先怀疑：
- rag indexing
- chromadb
- parser fallback

### 现象：刚发布后大量异常
优先动作：
- 先回滚
- 再排查根因

---

## 五、恢复优先级

故障时按这个优先级处理：

1. 先恢复首页/登录/API 基本可用
2. 再恢复生成链路
3. 再恢复检索与增强能力
4. 最后处理非核心退化问题

也就是说：

- 不要为了修一个检索边角问题，把整站继续挂着
- 先保证老师能看到、能登录、能走核心主流程

---

## 六、最常用恢复动作

### 重启 backend

```bash
docker compose restart backend
```

### 重启 worker

```bash
docker compose restart worker
```

### 重启 redis / chroma

```bash
docker compose restart redis
docker compose restart chromadb
```

### 全体重启

```bash
docker compose up -d --build
```

### 快速回滚

```bash
git checkout <stable-commit>
docker compose up -d --build
```

---

## 七、必须记录的复盘信息

每次故障后至少记录：

- 发生时间
- 影响范围
- 表现现象
- 最近变更 commit
- 根因判断
- 临时恢复动作
- 后续修复项

建议统一记到：
- changelog
- freeze 文档

也建议生成一份 incident 记录：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/incident_record.py \
  --title "Short incident title" \
  --owner <name>
```
- 或专门 incident 记录文档

---

## 一句话结论

故障响应最重要的不是“立刻解释一切”，而是：

- 先判断哪一层坏了
- 先恢复可用性
- 再慢慢做根因和修复
