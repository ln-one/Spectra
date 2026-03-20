# PostgreSQL 迁移检查清单

## 更新日期

- 2026-03-19

## 目的

这份清单用于把当前 `SQLite -> PostgreSQL` 的迁移前置工作拆成可执行项，避免在部署阶段才暴露数据层假设。

它关注的不是“现在立刻切库”，而是：

- 先找出 SQLite 假设
- 先补数据层约束与验证
- 先准备迁移与回滚方案

---

## 当前判断

当前系统已经适合进入 PostgreSQL 准备期，原因是：

- 核心 router / service 结构已完成第一轮收口
- `project / session / candidate-change / project-space` 语义已基本稳定
- 后续如果进入多机部署，SQLite 会成为明显瓶颈和障碍

当前仍需重点警惕的风险：

- SQLite 与 PostgreSQL 在事务、并发、大小写、默认值、JSON 行为上并不等价
- Prisma schema 虽可帮助迁移，但不能自动消除业务层假设
- 任务链路、幂等键、会话事件、candidate change 等新模型都需要真实数据库回归
- `backend/prisma/migrations/migration_lock.toml` 目前仍是 SQLite 基线，正式切 provider 前还需要准备 PostgreSQL migration baseline

---

## 一、迁移前必须回答的问题

1. 当前是否已经有必须保留的生产/演示数据
2. 是“全量重建”还是“带数据迁移”
3. PostgreSQL 是单机容器，还是独立实例
4. Chroma / Redis / PostgreSQL 是否会分机部署
5. 当前 `main` 分支是否允许在迁库期间短暂停机

---

## 二、模型与 schema 审核

重点检查：

- `Project`
- `GenerationSession`
- `GenerationTask`
- `Conversation`
- `Upload`
- `ParsedChunk`
- `Artifact`
- `ProjectVersion`
- `ProjectReference`
- `CandidateChange`
- `IdempotencyKey`

逐项确认：

1. 主键类型是否适合 PostgreSQL
2. 时间字段是否统一使用 UTC / timezone-aware 策略
3. JSON 字段是否依赖 SQLite 的宽松行为
4. 是否存在依赖 SQLite 空字符串 / null 宽松转换的逻辑
5. 唯一约束是否已显式表达，而不是靠业务代码默认维持
6. 是否存在大小写敏感差异会影响查询结果的字段

建议产物：

- `schema-risk` 表
- `model-by-model` 风险说明

---

## 三、查询与事务风险

重点排查以下模式：

1. 先查再写的乐观流程
- 如 candidate-change review
- generation session state transition
- idempotency 命中与写入

2. 依赖默认排序的查询
- SQLite 有时“看起来稳定”，PostgreSQL 不应依赖隐式顺序

3. `contains` / 模糊查询 / 大小写比较
- PostgreSQL 下需要明确 `ILIKE` / collation / normalization 策略

4. 分页边界
- `skip/take`、cursor、`lastCursor` 相关逻辑需回归

5. 事务边界
- 项目空间 review / artifact / version 写入是否需要事务包裹

建议动作：

- 搜索所有“先读后写”路径
- 标记哪些必须事务化
- 给关键链路增加 PostgreSQL 回归测试

---

## 四、重点高风险链路

### 1. Generation Session

关注点：
- session state
- outline draft
- event append
- artifact anchor
- latest candidate change

风险：
- 会话状态更新与事件写入如果缺少清晰事务边界，迁库后更容易出现竞争问题

### 2. Project Space

关注点：
- candidate change review
- accepted version 写入
- artifact metadata / normalize
- reference / member 相关更新

风险：
- 审核流和版本流更依赖一致性，SQLite 下未暴露的问题在 PostgreSQL 下会更明显

### 3. Idempotency

关注点：
- 幂等命中
- 幂等结果缓存
- 幂等键唯一性

风险：
- PostgreSQL 下应更严格地依赖唯一约束和冲突策略，而不是只靠应用层判断

---

## 五、迁移策略建议

### 推荐顺序

1. 先在本地或单独容器拉起 PostgreSQL
2. 跑 Prisma migration / schema sync
3. 跑主测试套 + 关键集成测试
4. 补 PostgreSQL 专项回归
5. 最后再考虑演示环境切换

### 建议阶段

#### Phase A：影子验证
- 不切正式默认库
- 只让测试和本地验证走 PostgreSQL

#### Phase B：演示环境试运行
- 只在一套演示环境切到 PostgreSQL
- 保留 SQLite 快速回退路径

#### Phase C：主线切换
- `main` 默认转 PostgreSQL
- SQLite 只保留本地轻量开发用途或完全退出

---

## 六、测试与验证清单

必须重点验证：

1. 登录 / 注册 / refresh token
2. project CRUD
3. 文件上传 / 删除 / intent 修改
4. RAG 索引 / 查询 / source detail
5. generation session 创建 / 事件流 / preview / export
6. candidate-change 提交 / 查询 / review
7. idempotency 命中行为
8. queue / worker 失败回写

建议新增：

- PostgreSQL smoke suite
- 项目空间 review 事务一致性测试
- 并发下的 idempotency / session update 测试

建议先运行：

- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_readiness_audit.py`
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_migration_sql_audit.py`
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_shadow_stack_audit.py`
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_shadow_smoke.py`
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_backup_restore_audit.py`
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_toolchain_audit.py`（检查 `pg_dump / pg_restore / psql` 或 Docker fallback 是否可用于 cutover）
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_backup.py`（生成 cutover / drill 用 PostgreSQL 备份命令，支持 dry-run 与执行）
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_restore.py`（生成 restore / rollback drill 用恢复命令，支持 dry-run 与执行）
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_recovery_drill.py`（把 backup audit、toolchain、backup/restore dry-run 串成一次恢复演练）
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_cutover_rehearsal.py`（把 cutover audit、recovery drill、可选 shadow smoke 串成一次完整 rehearsal）
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_cutover_audit.py`（会同时检查 migration lock 与 migration SQL baseline readiness）
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_schema_variant.py`（生成不改动主 schema 的 PostgreSQL Prisma variant，用于 shadow 验证与 baseline 预演）

建议影子环境使用：

- `docker compose -f docker-compose.yml -f docker-compose.postgres-shadow.yml up -d postgres backend worker redis chromadb`

---

## 七、部署前准备

如果后续要多机部署，建议同时完成：

1. PostgreSQL 独立实例或独立容器
2. 只对内网开放 `5432`
3. 配置备份与恢复策略
4. 区分 dev / demo / prod 的数据库连接配置
5. 明确 migration 执行入口，避免手工漂移

---

## 八、完成标准

可以认为“PostgreSQL 迁移前置准备完成”的标准：

- 已识别主要 SQLite 假设
- Prisma schema 与关键模型约束已审过
- PostgreSQL 本地/测试环境可稳定跑通主测试套
- 关键事务与一致性风险已有明确处理策略
- 演示环境切换与回滚路径已写清楚

---

## 一句话结论

PostgreSQL 迁移不是“换个连接串”这么简单。

真正要先做的是：
- 审数据层假设
- 补一致性与事务边界
- 让测试先替我们踩坑
# PostgreSQL Migration Checklist

## Current validation chain

- Render PostgreSQL Prisma schema variant:
  - `python3 /Users/ln1/Projects/Spectra/backend/scripts/postgres_schema_variant.py`
- Dry-run Prisma shadow validation path:
  - set `POSTGRES_SHADOW_DATABASE_URL=postgresql://...`
  - `python3 /Users/ln1/Projects/Spectra/backend/scripts/postgres_shadow_prisma_validate.py`
- Execute Prisma shadow validation path:
  - set `POSTGRES_SHADOW_DATABASE_URL=postgresql://...`
  - `python3 /Users/ln1/Projects/Spectra/backend/scripts/postgres_shadow_prisma_validate.py --run`
- Aggregate rehearsal including Prisma shadow execution:
  - set `POSTGRES_SHADOW_DATABASE_URL=postgresql://...`
  - `python3 /Users/ln1/Projects/Spectra/backend/scripts/postgres_cutover_rehearsal.py --run-prisma-shadow`
