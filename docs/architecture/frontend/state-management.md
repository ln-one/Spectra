# State Management

> 状态说明（2026-03-02）：前端业务状态以 Zustand 为主，React Context 仅用于少量 UI 组件上下文。

## 当前实现

| Store | 文件 | 主要职责 |
|---|---|---|
| Auth Store | `frontend/stores/authStore.ts` | 登录、注册、鉴权状态 |
| Chat Store | `frontend/stores/chatStore.ts` | 消息列表、发送、语音消息 |
| Upload Store | `frontend/stores/uploadStore.ts` | 上传队列与文件状态 |
| Generate Store | `frontend/stores/generateStore.ts` | 生成任务与进度 |

## 设计约束

- 业务数据和异步行为放在 Zustand store 中。
- 组件内部表单状态由 React Hook Form 管理，不放全局 store。
- React Context 只用于 UI 组件内部上下文（例如 `components/ui/form.tsx`）。

## 推荐实践

- 按业务域拆 store，避免单一超大 store。
- store action 命名使用动词短语，例如 `fetchMessages`、`sendMessage`。
- API 调用统一经 `frontend/lib/api/*` 封装，不在页面层直接拼接请求。

