# Backend Authentication

> 更新时间：2026-03-02

## 当前实现

- 注册：`POST /api/v1/auth/register`
- 登录：`POST /api/v1/auth/login`
- 刷新：`POST /api/v1/auth/refresh`
- 当前用户：`GET /api/v1/auth/me`
- 登出：`POST /api/v1/auth/logout`

## 认证机制

- JWT（`Authorization: Bearer <token>`）
- 密码哈希：`passlib[bcrypt]`
- token 解析与用户注入：`utils/dependencies.py`

## 访问约束

- 未认证请求返回 `401`
- 资源不属于当前用户返回 `403`
- token 无效或过期返回 `401`

## 开发要点

- 所有受保护接口统一依赖认证依赖注入
- Router 不手写重复 token 解析逻辑
- 认证异常统一走标准错误响应
