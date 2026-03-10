# OpenAPI 快速参考

## 核心原则

**AI 和开发者应该**：
- 读取 `docs/openapi/{paths|schemas}/{模块}.yaml`（50-150行）
- 避免读取 `docs/openapi-target.yaml`（1266行，自动生成）

## 常用命令

```bash
# 打包（修改后必须执行）
npm run bundle:openapi

# 自动监听（推荐开发时使用）
npm run watch:openapi

# 验证规范
npm run validate:openapi
```

## 文件对应表

| 功能模块 | 路径定义 | 数据模型 |
|---------|---------|---------|
| 认证 | `paths/auth.yaml` | `schemas/auth.yaml` |
| 对话 | `paths/chat.yaml` | `schemas/chat.yaml` |
| 文件 | `paths/files.yaml` | `schemas/files.yaml` |
| 生成 | `paths/generate.yaml` | `schemas/generate.yaml` |
| 预览 | `paths/preview.yaml` | `schemas/preview.yaml` |
| 检索 | `paths/rag.yaml` | `schemas/rag.yaml` |
| 项目 | `paths/project.yaml` | `schemas/project.yaml` |
| 通用 | - | `schemas/common.yaml` |

## 引用语法

```yaml
# 同目录
$ref: '#/UserInfo'

# 跨目录
$ref: '../schemas/auth.yaml#/UserInfo'
$ref: '../components/parameters.yaml#/PageParam'
```

## 工作流程

```
编辑模块文件 → 运行打包 → FastAPI 读取 → Swagger UI 展示
 (50行) (1秒) (openapi-target.yaml) (完美兼容)
```

## 注意事项

1. 不要直接编辑 `../openapi-target.yaml`
2. 修改后必须运行 `npm run bundle:openapi`
3. 提交代码前确保已打包
4. AI 应读取模块文件，不是打包文件
