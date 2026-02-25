#!/bin/bash
# OpenAPI 同步检查脚本
# 用于检查 FastAPI 生成的 OpenAPI 和文档中的 OpenAPI 是否一致
# 依赖: curl, yq (mikefarah/yq v4+, https://github.com/mikefarah/yq)

echo "🔄 检查 OpenAPI 同步状态..."

# 检查后端服务是否运行
if ! curl -s --max-time 5 http://localhost:8000/health > /dev/null 2>&1; then
    echo "⚠️  后端服务未运行，请先启动："
    echo "   cd backend && uvicorn main:app --reload"
    exit 1
fi

# 获取 FastAPI 生成的 OpenAPI
echo "📥 获取 FastAPI 生成的 OpenAPI..."
TEMP_JSON=$(mktemp)
TEMP_YAML=""
trap 'rm -f "${TEMP_JSON}" "${TEMP_YAML}"' EXIT
HTTP_STATUS=$(curl -s --max-time 10 -o "${TEMP_JSON}" -w "%{http_code}" http://localhost:8000/openapi.json)
if [ "$HTTP_STATUS" != "200" ]; then
    echo "❌ 获取 OpenAPI 失败，HTTP 状态码: $HTTP_STATUS"
    exit 1
fi

# 转换为 YAML（如果需要）
if command -v yq &> /dev/null; then
    TEMP_YAML="$(mktemp).yaml"
    yq eval -P "${TEMP_JSON}" > "${TEMP_YAML}"
    echo "✅ FastAPI OpenAPI 已保存到: ${TEMP_YAML}"
else
    echo "✅ FastAPI OpenAPI 已保存到: ${TEMP_JSON}"
    echo "💡 提示: 安装 yq (mikefarah/yq v4+) 可以转换为 YAML 格式"
    echo "   参考: https://github.com/mikefarah/yq#install"
fi

echo ""
echo "📊 对比建议："
echo "1. 查看 FastAPI 生成的规范: ${TEMP_JSON}"
echo "2. 对比文档中的规范: docs/openapi.yaml"
echo "3. 如果有差异，更新 docs/openapi/ 下的模块文件"
echo "4. 重新打包: npm run bundle:openapi"
