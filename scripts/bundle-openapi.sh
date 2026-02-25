#!/bin/bash
# OpenAPI 打包脚本 - 将拆分的文件合并成单文件

echo "📦 开始打包 OpenAPI 规范..."

# 检查 swagger-cli 是否安装
if ! command -v swagger-cli &> /dev/null; then
    echo "⚠️  swagger-cli 未安装，正在安装..."
    npm install -g @apidevtools/swagger-cli
fi

# 打包
swagger-cli bundle docs/openapi-source.yaml -o docs/openapi.yaml -t yaml

if [ $? -eq 0 ]; then
    echo "✅ 打包成功: docs/openapi.yaml"
else
    echo "❌ 打包失败"
    exit 1
fi
