# Backend OpenAPI 同步说明

> 更新时间：2026-03-02

## 目标

确保“接口实现”和“OpenAPI 文档”保持一致，同时区分目标契约与当前联调规范。

## 单一事实源

- 当前联调规范：`docs/openapi-source.yaml` -> `docs/openapi.yaml`
- 目标契约规范：`docs/openapi-target-source.yaml`
- 运行时文档：FastAPI `/openapi.json` 与 `/docs`

## 标准流程

1. 修改 `docs/openapi/paths/*.yaml` 或 `schemas/*.yaml`
2. 判断本次修改属于：
   - 当前已实现接口
   - 目标契约接口
3. 已实现接口执行 `npm run bundle:openapi`
4. 目标契约执行 `npm run bundle:openapi:target`
5. 若改动的是已实现接口，同步对齐后端 router/schema 实现
6. 本地验证 `/docs` 与请求响应一致

## 常用命令

```bash
npm run bundle:openapi
npm run bundle:openapi:target
npm run validate:openapi
npm run sync:openapi
```

## 提交要求

- 接口变更必须同时提交：
  - OpenAPI 模块文件
  - 对应入口文件更新（正式规范或目标契约）
  - 若接口已实现：后端实现代码 + 必要测试
