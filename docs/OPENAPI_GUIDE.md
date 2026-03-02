# OpenAPI 使用指南

> 更新时间：2026-03-02

## 编辑原则

- 日常编辑 `docs/openapi/` 下模块文件
- 不直接手改 `docs/openapi.yaml`（由构建生成）

## 最小工作流

```bash
# 编辑模块文件后
npm run bundle:openapi
npm run validate:openapi
```

## 目录说明

- `docs/openapi/paths/`：接口路径定义
- `docs/openapi/schemas/`：数据模型定义
- `docs/openapi/components/`：公共组件
- `docs/openapi-source.yaml`：聚合入口
- `docs/openapi.yaml`：打包产物

## 验收标准

- Swagger 页面可正常展示
- 实际 API 请求响应与文档一致
