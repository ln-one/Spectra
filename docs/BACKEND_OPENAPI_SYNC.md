# Backend OpenAPI 同步说明

> 更新时间：2026-03-02

## 目标

确保“接口实现”和“OpenAPI 文档”保持一致。

## 单一事实源

- 设计与维护：`docs/openapi/` 模块文件
- 打包输出：`docs/openapi.yaml`
- 运行时文档：FastAPI `/openapi.json` 与 `/docs`

## 标准流程

1. 修改 `docs/openapi/paths/*.yaml` 或 `schemas/*.yaml`
2. 执行 `npm run bundle:openapi`
3. 对齐后端 router/schema 实现
4. 本地验证 `/docs` 与请求响应一致

## 常用命令

```bash
npm run bundle:openapi
npm run validate:openapi
npm run sync:openapi
```

## 提交要求

- 接口变更必须同时提交：
  - OpenAPI 模块文件
  - 后端实现代码
  - 必要测试
