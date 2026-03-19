# 下一阶段架构优化清单

## 背景

当前项目已经完成了一轮较大范围的结构收口：

- 多个超大 `router` / `service` 文件已拆分为目录模块
- 前端重复 API 源已收敛到 `sdk`
- `router` 中一部分业务编排已经下沉到 `service`
- 根目录平铺模块显著减少

因此，下一阶段的重点不再是单纯“拆大文件”，而是继续提升架构一致性、边界清晰度和长期可维护性。

## 当前阶段结论

项目已经从“高耦合、平铺、少数巨型文件主导”的状态，进入到“模块化基础已建立，但架构边界仍需统一”的阶段。

截至当前阶段，这里的几项基础工作已经实质落地：

- `main.py` 已拆成 `/Users/ln1/Projects/Spectra/backend/app_setup/`
- 大型 router / service 已完成第一轮 package 化
- `services/` 已开始形成 `application / generation / media / platform` 分区
- `architecture_guard.py` 当前已清零告警
- AI / outline / task 执行链路已补第一轮 timeout 语义

接下来最值得做的，不是继续机械拆分，而是解决以下三类问题：

1. 隐性依赖仍然存在
2. `service` 分层语义还不完全统一
3. 应用入口与跨模块组装逻辑仍有收敛空间

---

## 架构守门说明

为避免结构在后续迭代中反弹，已新增轻量守门脚本：

- `/Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py`

执行方式：

```bash
python3 backend/scripts/architecture_guard.py
```

规则采用分级提醒，而不是硬性一刀切：

- `>300 行`：warning，提示复查单一职责
- `>500 行`：error，默认建议拆分
- `>800 行`：critical，列为优先重构项
- 新增根目录平铺 `*_service.py`：warning
- 生产代码新增 `from services import ...`：warning

这样既能保护当前重构成果，也不会过度打断尚在开发中的功能迭代。

---

## 优先级 P0

### 1. 收敛 `services/__init__.py` 的隐性耦合

**现象**

项目中仍存在通过 `from services import xxx` 获取依赖的模式。该模式虽然使用方便，但会带来：

- 依赖关系不透明
- 模块替换成本高
- 测试 patch 边界模糊
- 容易让上层直接依赖“服务总出口”，弱化领域边界

**风险**

- 长期会重新抬高模块间耦合
- 目录虽已收口，但依赖图仍可能继续变脏

**建议动作**

- 新代码禁止新增 `from services import xxx`
- 逐步把现有导入改成显式模块导入
- 在必要场景下保留兼容出口，但不再作为默认使用方式

**目标状态**

- 依赖路径能直接表达模块归属
- 看 import 就能判断依赖方向

---

### 2. 拆分应用入口 `main.py`

**现象**

`/Users/ln1/Projects/Spectra/backend/main.py` 当前同时承担：

- app 初始化
- lifespan 管理
- middleware 注册
- router 注册
- 全局异常处理
- Redis / queue 初始化

虽然体量不算失控，但职责偏多，已经是典型的“应用入口聚合点”。

**风险**

- 入口改动容易牵一发而动全身
- 不利于后续做测试 app / worker app / 不同部署模式

**建议动作**

拆成以下几个方向：

- `app/factory.py`：创建 FastAPI app
- `app/lifespan.py`：生命周期管理
- `app/middleware.py`：middleware 装配
- `app/exceptions.py`：异常处理注册
- `app/routes.py`：路由注册

**目标状态**

- `main.py` 只保留创建 app 的极薄入口
- 应用装配逻辑清晰可替换

---

### 3. 明确 `service` 的层级语义

**现象**

当前多个 service 已经目录化，但在语义上仍混合了两类职责：

- API / use-case 编排服务
- 领域能力 / 业务规则服务

例如：

- `/Users/ln1/Projects/Spectra/backend/services/project_api_service.py`
- `/Users/ln1/Projects/Spectra/backend/services/rag_api_service/`
- `/Users/ln1/Projects/Spectra/backend/services/file_upload_service/`

**风险**

- 容易把“接口编排”和“核心业务能力”继续混在一起
- 后续如果想抽 worker / 复用领域逻辑，会边界不清

**建议动作**

逐步形成两层：

- `api/usecase service`：面向 router，负责权限后的接口编排
- `domain service`：面向业务能力，负责核心规则和流程能力

**目标状态**

- router 只调 use-case service
- use-case service 再调 domain service
- domain service 不关心 HTTP 语义

---

## 优先级 P1

### 4. 统一模块目录命名规范

**现象**

当前目录模块命名已经明显改善，但风格仍不完全统一，例如：

- `generation_session_service/`
- `project_space_service/`
- `rag_api_service/`
- `file_upload_service/`
- `preview_helpers/`

**风险**

- 随着模块越来越多，命名风格不统一会再次降低可读性

**建议动作**

统一一种命名约定，并写入 standard：

- 方案 A：统一 `xxx_service/`
- 方案 B：统一领域名目录，如 `generation_session/`、`project_space/`

更推荐：

- 领域目录 + 子文件表达职责
- 避免目录名本身重复出现 `service`

**目标状态**

- 看目录名就知道领域，不需要靠后缀猜含义

---

### 5. 集中跨模块的序列化 / 组装逻辑

**现象**

当前多个模块仍分散存在：

- response payload 组装
- DB record -> API shape 映射
- preview/export/source detail 拼装

虽然比之前已经好很多，但还没形成统一层。

**风险**

- 同类转换逻辑散落在多个 service 中
- 接口字段演进时容易漏改

**建议动作**

按领域增加轻量层，例如：

- `serializers.py`
- `assemblers.py`
- `presenters.py`

用于承接：

- API 返回体组装
- 领域对象到 schema 的映射

**目标状态**

- service 关注流程
- serializer / assembler 关注结构转换

---

### 6. 持续处理剩余中等文件

当前仍有一些 250~300 行以上、但尚未成为风险点的文件：

- `/Users/ln1/Projects/Spectra/backend/services/project_space_service/service.py`
- `/Users/ln1/Projects/Spectra/backend/services/file_parser.py`
- `/Users/ln1/Projects/Spectra/backend/services/network_resource_strategy.py`
- `/Users/ln1/Projects/Spectra/backend/main.py`

**建议策略**

- 不急于一次性全部拆
- 优先处理“职责混合明显”的文件
- 对“只是行数偏多但边界清楚”的文件可以后置

---

## 优先级 P2

### 7. 建立模块依赖边界约束

**现象**

结构虽然已比之前清晰，但如果没有约束，后续开发仍可能逐步回到“谁都能 import 谁”的状态。

**建议动作**

增加简单的架构约束，例如：

- `router` 不直接依赖某些底层实现
- `domain service` 不依赖 `router`
- `schema` 不反向依赖 `service`
- 通过脚本或 lint 规则检查 import 边界

**目标状态**

- 边界不是靠默契维护，而是靠规则兜底

---

### 8. 为 worker / API / future deployment 做入口解耦准备

**现象**

当前代码已经比之前更适合未来做 Docker / K8s / 多 entrypoint，但应用装配仍偏集中。

**建议动作**

后续可逐步明确：

- API 入口
- worker 入口
- queue 初始化入口
- 健康检查与运行时依赖边界

**收益**

- 更容易做容器化
- 更容易做扩缩容
- 更容易拆独立运行进程

---

## 推荐执行顺序

### 第一阶段

1. 收敛 `services/__init__.py` 的隐性耦合
2. 拆分 `/Users/ln1/Projects/Spectra/backend/main.py`
3. 统一 service 目录命名规范

### 第二阶段

1. 为核心领域补 `serializer/assembler` 层
2. 继续处理剩余中等文件
3. 统一 use-case service / domain service 分层

### 第三阶段

1. 增加 import 边界检查
2. 为 worker / API / deployment 入口分离做准备

---

## 当前建议

现阶段不建议做大规模重写。

最合适的策略仍然是：

- 小步收口
- 每次只改一层问题
- 每次改动都配套验证
- 先统一规则，再继续拆细节

换句话说：

当前项目已经具备继续优化架构的基础，但接下来更重要的是“统一原则”，而不只是“继续拆文件”。
