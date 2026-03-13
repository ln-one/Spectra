	# OpenAPI 使用指南

> 更新时间：2026-03-02


## 编辑原则

- 日常编辑 `docs/openapi/` 下模块文件
- 不直接手改 `docs/openapi-target.yaml`（由构建生成）

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
- `docs/openapi-target-source.yaml`：聚合入口
- `docs/openapi-target.yaml`：打包产物

## 验收标准

- Swagger 页面可正常展示
- 实际 API 请求响应与文档一致

## Target 契约维护（规划与实现对齐）

当更新目标契约时：

```bash
# 打包目标契约
npm run bundle:openapi:target

# 校验目标契约
npm run validate:openapi:target
```

实现与 Target 的对齐检查（需后端运行）：

```bash
node scripts/validate-contract-target.js
```
