# Backend Authentication

> 更新时间：2026-03-02

## 当前实现

- 注册：`POST /api/v1/auth/register`
- 登录：`POST /api/v1/auth/login`
- 当前登录态基于 Limora cookie session；Spectra 不再提供 `POST /api/v1/auth/refresh`
- 当前用户：`GET /api/v1/auth/me`
- 登出：`POST /api/v1/auth/logout`

## 认证机制

- Limora cookie session
- Spectra backend 通过 Limora BFF 做 identity mirror
- 用户注入：`utils/dependencies.py` 通过请求 Cookie 解析当前身份

## 访问约束

- 未认证请求返回 `401`
- 资源不属于当前用户返回 `403`
- Cookie 缺失、会话无效或已过期返回 `401`

## 开发要点

- 所有受保护接口统一依赖认证依赖注入
- Router 不手写重复 token 解析逻辑
- 认证异常统一走标准错误响应
