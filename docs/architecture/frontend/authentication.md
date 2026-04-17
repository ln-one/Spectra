# Authentication

## 认证方案

前端采用 **Limora cookie session** 认证方案。

- 登录、注册、登出、当前用户都通过 `/api/v1/auth/*`
- 请求统一使用 `credentials: "include"`
- 不再使用 `access_token / refresh_token`
- 不提供 `/api/v1/auth/refresh`

## 当前行为

- 登录成功后，浏览器保存 Limora session cookie
- `AuthBootstrap` 通过 `/api/v1/auth/me` 恢复登录态
- 表单提交与会话检查分离：
  - `isSubmitting` 只控制登录/注册提交态
  - `isCheckingSession` 只控制 bootstrap 检查态

## API 客户端

- 使用 `frontend/lib/sdk/client.ts` 的 Fetch 封装
- 所有鉴权请求默认 `credentials: "include"`
- `/api/v1/auth/login` 与 `/api/v1/auth/register` 属于免预先认证入口
- `/api/v1/auth/me` 仍属于受保护入口

## 路由保护

- 当前前端不依赖本地 token 或 cookie 名称硬编码做认证判断
- 登录态恢复以 `/api/v1/auth/me` 的实际结果为准
- 未登录时由页面或调用方按 `401`/`403` 结果处理跳转

## 相关文档

- [Auth Pages](./auth-pages.md) - 登录注册页面设计
- [API Integration](./api-integration.md) - API 客户端配置
