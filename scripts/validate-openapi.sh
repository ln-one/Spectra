#!/bin/bash
# OpenAPI 验证脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "🔍 验证 OpenAPI 规范..."

# 验证语法
"${REPO_ROOT}/node_modules/.bin/redocly" lint --config "${REPO_ROOT}/.redocly.yaml" "${REPO_ROOT}/docs/openapi.yaml"

if [ $? -eq 0 ]; then
    echo "✅ OpenAPI 规范验证通过"
    echo ""
    echo "📊 统计信息:"
    echo "  - 总行数: $(wc -l < "${REPO_ROOT}/docs/openapi.yaml")"
    echo "  - 源文件: $(wc -l < "${REPO_ROOT}/docs/openapi-source.yaml") 行"
    echo "  - 模块数: $(ls "${REPO_ROOT}/docs/openapi/paths/"*.yaml | wc -l) 个路径文件"
    echo "  - Schema: $(ls "${REPO_ROOT}/docs/openapi/schemas/"*.yaml | wc -l) 个模型文件"
else
    echo "❌ OpenAPI 规范验证失败"
    exit 1
fi
