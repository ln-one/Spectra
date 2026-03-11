# Legacy API Removal Checklist

> 生成时间：2026-03-11
> 目的：当确认无旧接口调用时，按此清单完成“一键删除”。

## 1. 先做的准备

- 观察日志 `deprecated_endpoint_used` 至少 7 天无调用。
- 若仍有调用，先完成前端/外部调用迁移。

## 2. 关停开关（可回滚）

- 设置环境变量：`LEGACY_API_ENABLED=false`
- 验证旧接口返回 `410 Gone`（提示使用 session-first）。
- 观察 24-48 小时确认无影响。

## 3. 删除后端路由与逻辑

删除或移除路由文件中的旧端点：

- `/Users/ln1/Projects/Spectra/backend/routers/generate.py`
  - `POST /api/v1/generate/courseware`
  - `GET /api/v1/generate/tasks/{task_id}/status`
  - `GET /api/v1/generate/tasks/{task_id}/versions`
- `/Users/ln1/Projects/Spectra/backend/routers/download.py`
  - `GET /api/v1/generate/tasks/{task_id}/download`
- `/Users/ln1/Projects/Spectra/backend/routers/preview.py`
  - `GET /api/v1/preview/{task_id}`
  - `POST /api/v1/preview/{task_id}/modify`
  - `GET /api/v1/preview/{task_id}/slides/{slide_id}`
  - `POST /api/v1/preview/{task_id}/export`

同时删除相关依赖（若不再使用）：

- `/Users/ln1/Projects/Spectra/backend/utils/deprecation.py`
- `/Users/ln1/Projects/Spectra/backend/utils/legacy_guard.py`

## 4. 更新 OpenAPI 与文档

- 从 `/Users/ln1/Projects/Spectra/docs/openapi/paths/generate-task.yaml` 删除旧路径
- 从 `/Users/ln1/Projects/Spectra/docs/openapi/paths/preview.yaml` 删除旧路径
- 重新打包 OpenAPI：`npm run bundle:openapi`
- 更新 `/Users/ln1/Projects/Spectra/docs/project/PROJECT_SPACE_API_DRAFT_2026-03-09.md` 的兼容层说明

## 5. 清理测试与前端调用（如存在）

- 清除任何旧接口相关测试/调用。

## 6. 最终确认

- 跑一轮核心集成测试
- 观察错误日志 24 小时
