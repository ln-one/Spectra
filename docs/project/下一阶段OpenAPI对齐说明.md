# 下一阶段 OpenAPI 对齐说明

> 更新时间：2026-03-22
> 状态：当前生效

本文档用于帮助前后端按下一阶段 `target` 契约并行开发。

## 1. 先看哪套 OpenAPI

当前仓库有两套 OpenAPI：

- `docs/openapi-source.yaml` -> 当前已实现、可直接联调的现状契约
- `docs/openapi-target-source.yaml` -> 下一阶段要对齐的目标契约

本阶段新增能力和增强体验，一律先按 `target` 对齐，不要误以为已经是当前后端现状。

## 2. 这一阶段 target 主要新增了什么

### 2.1 系统级业务配置页

新增：

- `GET /api/v1/system-settings`
- `PATCH /api/v1/system-settings`

用途：

- 不再频繁手改 `.env`
- 统一调整模型和生成默认值
- 服务开发调试和前后端联调

第一版只管理系统级业务配置，不管理数据库、JWT、API Key、Redis、存储路径等部署级敏感配置。

### 2.2 会话标题与 Run 历史

新增或补充：

- session 展示标题字段
  - `display_title`
  - `display_title_source`
  - `display_title_updated_at`
- chat 首条消息后标题更新字段
  - `session_title_updated`
  - `session_title`
  - `session_title_source`
- `SessionRun`
- `RunTracePayload`

用途：

- 会话列表不再只有 id
- 同一会话内每次工具执行有独立 run
- 进行态、完成态、artifact 能对齐到同一 run

### 2.3 结构化生成流

目标契约不再只表达“状态变化”，还开始表达“内容逐步出现”。

第一版重点：

- 大纲逐条输出
- PPT 逐页输出
- 单页局部修改进展输出

对应事件类型已经补进 target。

### 2.4 PPT 单页局部修改

目标契约里已经明确：

- 用户必须输入明确修改需求
- 默认只改当前页
- 默认保留风格、布局和整套一致性

这块不是单纯“重绘”，而是“按需求改单页”。

## 3. 前端先对齐什么

B 侧优先按 `target` 对齐这几件事：

1. 系统级业务配置页界面
2. 会话列表展示标题
3. 历史区 run 展示逻辑
4. 大纲逐条出现和 PPT 逐页出现的流式体验
5. 预览页单页卡片上的局部修改入口

前端在开发时要特别注意：

- 现在 `target` 不是现状，要看后端落地到哪一步
- `run_id` 才是同一次工具执行的稳定锚点
- `pending` 标题先显示编号标题，不要等语义标题

## 4. 后端先对齐什么

C 侧优先按 `target` 落以下内容：

1. 系统级业务配置读写接口
2. session 展示标题字段与首条消息后的自动改名
3. `SessionRun` 实体与 run 基础状态流转
4. artifact 与 run 对齐
5. 单页局部修改请求语义
6. 事件 payload 支持结构化内容流

D 侧如果参与这一阶段，优先参与：

- 结构化生成流的数据语义
- 标题语义化策略
- run 历史的智能命名增强

但不要抢 C 的主线 owner。

## 5. 这阶段不要误解的地方

### 5.1 target 不是现状

`target` 表示下一阶段希望前后端共同靠拢的契约，不表示后端今天已经全实现。

### 5.2 live 不要被误伤

当前可联调仍以 `source` 为准：

- `docs/openapi-source.yaml`
- `docs/openapi.yaml`

### 5.3 单页局部修改不是自由大改

默认语义是：

- 只改当前页
- 带明确需求
- 尽量不影响其他页

### 5.4 流式体验不是必须做到 token 级

这一阶段先做到：

- 大纲逐条
- PPT 逐页
- 单页修改有过程反馈

已经足够支撑“等待感显著降低”的目标。

## 6. 建议阅读顺序

1. `docs/project/系统级业务配置页契约设计.md`
2. `docs/project/会话标题与Run历史契约设计.md`
3. `docs/project/结构化生成流与PPT单页局部修改契约设计.md`
4. `docs/openapi-target-source.yaml`
5. `docs/openapi/README.md`

## 7. 结论

这一阶段前后端并行开发的原则是：

- 现状联调看 `source`
- 下一阶段设计和并行拆分看 `target`
- 所有新增能力先在 `target` 对齐，再进入实现
