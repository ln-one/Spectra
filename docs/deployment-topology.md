# Deployment Topology Draft

## 更新日期

- 2026-03-19

## 目标

为后续“演示环境 / 多机部署 / main 分支自动部署”提前给出一版清晰拓扑，减少部署时边做边猜。

这份草案面向当前阶段：

- 用户量小
- 主要服务指导老师演示与团队验证
- 以稳定、可回滚、易排障为优先目标

---

## 当前判断

现阶段更适合：

- Docker / Docker Compose 分职责部署
- 多机内网通信
- `main` 作为唯一线上基线

现阶段暂不建议：

- 直接上 Kubernetes
- 同时维护多套线上环境
- 在弱机器上全功能高并发运行

---

## 一、推荐部署目标

### 外部访问

对公网暴露：

- `ln1.fun`：前端入口
- `api.ln1.fun`：后端 API 入口

不对公网暴露：

- `worker`
- `redis`
- `postgres`
- `chromadb`

原则：

- 只有入口服务暴露公网
- 其他服务全部走私网 / VPC 通信

---

## 二、推荐机器分工

### 方案 A：5 台机器

1. `frontend + reverse proxy`
2. `backend api`
3. `worker`
4. `redis + postgres`
5. `chromadb`

适用：
- 指导老师演示
- 小规模线上试运行

### 方案 B：6 台机器

1. `frontend + reverse proxy`
2. `backend api`
3. `worker-1`
4. `worker-2`
5. `redis + postgres`
6. `chromadb`

适用：
- 希望生成任务更稳
- 降低单 worker 卡死对整体体验的影响

### 方案 C：前端外部托管 + 5 台后端机器

如果前端交给专业平台托管，可释放一台机器给后端：

1. `backend api`
2. `worker-1`
3. `worker-2`
4. `redis + postgres`
5. `chromadb`

适用：
- 前端部署希望更省心
- 服务器资源优先给生成与数据层

---

## 三、职责划分原则

### Frontend / Reverse Proxy

职责：
- 域名入口
- HTTPS 终止
- 静态资源 / Web 入口

建议：
- 如果自部署，优先 `Caddy` 或 `Nginx`
- 如果托管到专业平台，则只保留后端域名在自有机器

### Backend API

职责：
- 认证
- 项目与会话 API
- 文件与 project-space API
- 对 worker / queue / db / rag 的编排入口

原则：
- 不跑重型生成任务
- 不和 worker 混跑

### Worker

职责：
- outline draft
- generation task
- indexing / parse 等异步任务

原则：
- 控制并发
- 强化 timeout / retry / stuck 回收
- 与 API 分机部署

### Redis

职责：
- queue
- job state
- session/task 相关异步中介

原则：
- 只走内网
- 保持轻量与稳定

### PostgreSQL

职责：
- 主业务数据存储

原则：
- 不对公网开放
- 明确 migration / backup / restore

### ChromaDB

职责：
- 向量检索
- source retrieval

原则：
- 与 API 分机
- 数据量增长时重点关注内存与 IO

---

## 四、网络与安全建议

1. 所有服务尽量放在同一 VPC / 私网
2. 只给入口机配置公网访问
3. `redis/postgres/chromadb` 只开放内网端口
4. worker 也尽量不暴露公网
5. 域名和 HTTPS 只在入口层处理

建议开放方式：

- 公网：`80/443` 到 reverse proxy
- 内网：
  - `8000` backend
  - `6379` redis
  - `5432` postgres
  - `8001/8000` chroma（按实际）

---

## 五、main 分支部署原则

当前建议：

- 云端只部署 `main`
- feature 分支不直接上演示环境
- 合并到 `main` 之前必须过测试与契约检查

推荐发布流：

1. PR 合并到 `main`
2. 自动或半自动拉取代码
3. 重新构建需要变更的容器
4. 健康检查
5. 若失败则快速回滚到上一个 commit

---

## 六、自动部署建议

当前最合适的自动部署形式：

- GitHub Actions + SSH
- 服务器执行 `git pull` + `docker compose up -d --build`

原因：
- 简单
- 可控
- 足够支撑当前演示环境
- 比直接上 K8s 成本低很多

---

## 七、当前最大的部署障碍

按优先级排序：

1. PostgreSQL 尚未真正切换
2. 部分兼容层还没完全瘦身
3. 外部模型调用虽然已有 timeout，但还需要更多线上观测信息
4. worker / queue / db 的运维 runbook 还没写
5. 环境变量、域名、内网地址还没有形成正式部署说明

---

## 八、下一步建议产物

建议继续补：

- `/Users/ln1/Projects/Spectra/docs/runbook-main-deploy.md`
- `/Users/ln1/Projects/Spectra/docs/runbook-incident-response.md`
- `/Users/ln1/Projects/Spectra/docs/postgres-migration-checklist.md`
- `/Users/ln1/Projects/Spectra/backend/scripts/docker_deploy_readiness_audit.py`
- `/Users/ln1/Projects/Spectra/backend/scripts/deploy_preflight.py`
- `/Users/ln1/Projects/Spectra/backend/scripts/deploy_smoke_check.py`

---

## 一句话结论

当前最现实的路线不是“直接上 K8s”，而是：

- 先把 `main` 作为唯一线上基线
- 先把多机 Docker 拓扑和内网通信设计清楚
- 先让演示环境稳住，再逐步进化
