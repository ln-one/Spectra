# DBOS Worker 健康与恢复 Runbook

本 runbook 只定义观测、确认和安全重启流程。本轮不直接修改 `dbos` 系统表，不删除 workflow，不清空队列，也不盲目提高队列并发。

## 1. 先看 Worker 探针

Worker 默认在内部端口 `8787` 提供探针。该端口只应被部署平台的内部 health check 和运维网络访问。

```sh
curl -i http://worker:8787/healthz
curl -i http://worker:8787/readyz
curl -i http://worker:8787/queuez
```

含义：

- `/healthz` 返回 `200`：Node Worker 的 HTTP 进程仍在运行；不代表数据库或 DBOS 已就绪。
- `/readyz` 返回 `200`：DBOS runtime 已启动，并且最近的数据库队列健康快照仍然有效。
- `/queuez` 返回 `503`：维护队列超过 age 阈值，或存在 `MAX_RECOVERY_ATTEMPTS_EXCEEDED`；这是需要人工调查的队列故障，不是自动重排队信号。

响应只包含队列名称、状态计数、队列深度和 age，不包含 workflow input 或用户内容。

## 2. 使用 doctor 取得完整只读快照

```sh
npm run dbos:doctor
```

doctor 非零退出时，先保存 JSON 输出和对应时间窗口的 Worker 日志。重点记录：

- 最老非终态 workflow 的 queue、status、workflow name 和 age；
- 每个 queue 的非终态深度；
- `ERROR` 与 `MAX_RECOVERY_ATTEMPTS_EXCEEDED` 数量；
- Worker executor、DBOS recovery 和 lease 的状态。

日志只使用稳定事件名，例如 `worker.lifecycle.ready`、`dbos.queue.health` 和 `dbos.queue.health.failed`。不要把请求体、prompt、cookie、token、完整数据库 URL 或完整错误对象复制到工单中。

## 3. 安全恢复顺序

1. 确认 `/healthz`、`/readyz`、`/queuez` 的状态和时间戳。
2. 通过只读 DBOS/数据库诊断确认最老 workflow 是否仍有 active executor、有效 lease 或 owner。
3. 检查同一 Worker 是否正在启动、停止、恢复或反复崩溃；先排除数据库连接和部署探针误报。
4. 若没有有效 executor 且 DBOS recovery 条件满足，执行一次受控 Worker 重启，让 DBOS 自己完成 recovery。
5. 重启后等待 `/readyz` 返回 `200`，再观察 `/queuez`、队列 oldest age 和失败计数是否向下变化。
6. 若状态没有变化，暂停进一步重启，保留 workflow 标识、executor/lease 诊断和日志时间窗，升级给 DBOS/数据库负责人。

禁止用 SQL 直接删除 workflow、更新 DBOS 状态、清空队列或复制一个已有 workflow 重新入队。任何产品 workflow 重试都必须经过既有幂等入口，并由负责人明确批准。

## 4. 部署配置

Worker 镜像暴露 TCP `8787`。部署平台应将：

- liveness probe 指向 `/healthz`；
- readiness probe 指向 `/readyz`；
- `/queuez` 接入告警而不是直接作为自动重启条件。

本轮没有自动 schedule coalescing、backpressure、取消、删除或重排队逻辑；这些需要单独设计和压测后再实施。
