# State Management

> 状态说明（2026-03-20）：前端业务状态以 Zustand 为主，React Context 仅用于少量 UI 组件上下文。

## 当前实现

| Store | 文件 | 主要职责 |
|---|---|---|
| Auth Store | `frontend/stores/authStore.ts` | 登录/注册状态、用户信息、鉴权状态 |
| Notification Store | `frontend/stores/notificationStore.ts` | 全局通知与提醒状态 |
| Project Store（Facade） | `frontend/stores/projectStore.ts` | 项目域统一选择器与 action 暴露 |
| Project Store Slices | `frontend/stores/project-store/*` | chat / files / generation / layout / project 分域 action 与类型 |

## 设计约束

- 业务数据和异步行为放在 Zustand store 中。
- 组件内部表单状态由 React Hook Form 管理，不放全局 store。
- React Context 仅用于基础 UI 上下文（如表单上下文）。

## 推荐实践

- 页面层只调用 store 暴露的语义化 action，不直接拼接复杂状态更新。
- 新增状态优先落在对应切片文件，再由 `projectStore.ts` 统一装配。
- API 调用统一经 `frontend/lib/sdk/*` 或领域封装（`lib/project-space/*`、`lib/auth/*`）发起，不在页面层直接请求。
