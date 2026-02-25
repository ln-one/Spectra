#!/bin/bash
# OpenAPI 打包脚本 - 将拆分的文件合并成单文件

echo "📦 开始打包 OpenAPI 规范..."

# 确保依赖已安装
if [ ! -f "./node_modules/.bin/redocly" ]; then
    echo "⚠️  依赖未安装，请先运行: npm install"
    exit 1
fi

# 打包
./node_modules/.bin/redocly bundle docs/openapi-source.yaml -o docs/openapi.yaml

if [ $? -eq 0 ]; then
    echo "✅ 打包成功: docs/openapi.yaml"
else
    echo "❌ 打包失败"
    exit 1
fi
