# 审核问题修复任务

## 后端 P0 修复

<task title="Task 1.1: 统一 API 契约字段">

Status: not started

Task details:
- 更新 `docs/openapi.yaml`：Project 用 `name`，Auth 用 `access_token`
- 更新相关文档说明
- 确保前后端字段命名一致

</task>

<task title="Task 1.2: 修复数据库写入参数">

Status: not started

Task details:
- 修复 `backend/routers/projects.py` 的 create 方法，添加 userId 参数
- 修复 `backend/routers/files.py` 的 upload 方法，添加 projectId 和 fileType
- 确保所有必填字段都有值

</task>

<task title="Task 1.3: 完善认证依赖">

Status: not started

Task details:
- 更新 `backend/utils/dependencies.py` 的 get_current_user，添加 JWT 验证逻辑（骨架）
- 更新 `backend/services/auth_service.py` 添加 verify_token 等基础方法
- 更新 `docs/architecture/backend/authentication.md` 文档

</task>

<task title="Task 1.4: 添加数据隔离注释">

Status: not started

Task details:
- 在 `backend/routers/projects.py` 添加用户隔离检查的 TODO 注释
- 在 `backend/routers/files.py` 添加项目归属验证的 TODO 注释
- 更新 `docs/architecture/backend/security.md` 说明数据隔离设计

</task>

## 前端 P0 修复

<task title="Task 2.1: 统一 API 方案文档">

Status: not started

Task details:
- 更新 `docs/architecture/frontend/api-integration.md`
- 明确说明使用 Fetch API（与实际代码一致）
- 删除 Axios 相关描述

</task>

<task title="Task 2.2: 拆分 api.ts 文件">

Status: not started

Task details:
- 创建 `frontend/lib/api/client.ts` - 基础客户端
- 创建 `frontend/lib/api/auth.ts` - 认证相关 API
- 创建 `frontend/lib/api/projects.ts` - 项目相关 API
- 创建 `frontend/lib/api/files.ts` - 文件相关 API
- 创建 `frontend/lib/api/index.ts` - 统一导出
- 更新所有导入路径
- 确保每个文件不超过 300 行

</task>

<task title="Task 2.3: 统一 Token 命名">

Status: not started

Task details:
- 在 `frontend/lib/auth.ts` 中统一使用 `access_token`
- 在 `frontend/stores/authStore.ts` 中统一使用 `access_token`
- 更新相关文档

</task>

<task title="Task 2.4: 统一注册参数命名">

Status: not started

Task details:
- 统一注册参数为：`email`, `username`, `password`
- 更新 `frontend/app/auth/register/page.tsx`
- 更新 `frontend/stores/authStore.ts`
- 更新相关文档

</task>

## P1 文档修复

<task title="Task 3.1: 统一 API 路径前缀">

Status: not started

Task details:
- 检查所有后端架构文档
- 统一示例代码使用 `/api/v1` 前缀
- 特别检查 `docs/architecture/backend/router-layer.md` 等文档

</task>

<task title="Task 3.2: 修复文档断链">

Status: not started

Task details:
- 检查 `docs/architecture/backend-architecture.md` 的链接
- 检查 `docs/architecture/deployment/environment-variables.md` 的链接
- 修复或删除不存在的链接

</task>

<task title="Task 3.3: 统一错误响应格式">

Status: not started

Task details:
- 统一 `docs/architecture/backend/router-layer.md` 的错误格式
- 统一 `docs/architecture/backend/error-handling.md` 的错误格式
- 统一 `docs/architecture/api-contract.md` 的错误格式
- 确保三处文档口径一致

</task>

## 验证

<task title="Task 4.1: 运行测试">

Status: not started

Task details:
- 运行前端测试：`cd frontend && npm test`
- 运行后端测试：`cd backend && pytest`
- 确保所有测试通过

</task>

<task title="Task 4.2: CI 验证">

Status: not started

Task details:
- 提交代码到分支
- 确保 GitHub Actions CI 通过
- 检查 lint、format、test、build 都成功

</task>
