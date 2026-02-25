#!/bin/bash
# OpenAPI 验证脚本

echo "🔍 验证 OpenAPI 规范..."

# 验证语法
./node_modules/.bin/redocly lint docs/openapi.yaml

if [ $? -eq 0 ]; then
    echo "✅ OpenAPI 规范验证通过"
    echo ""
    echo "📊 统计信息:"
    echo "  - 总行数: $(wc -l < docs/openapi.yaml)"
    echo "  - 源文件: $(wc -l < docs/openapi-source.yaml) 行"
    echo "  - 模块数: $(ls docs/openapi/paths/*.yaml | wc -l) 个路径文件"
    echo "  - Schema: $(ls docs/openapi/schemas/*.yaml | wc -l) 个模型文件"
else
    echo "❌ OpenAPI 规范验证失败"
    exit 1
fi
