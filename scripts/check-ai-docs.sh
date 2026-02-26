#!/bin/bash

# AI 文档验证脚本
# 检查所有必需的 AI 文档是否存在，并验证文档大小

set -e

echo "🔍 检查 AI 文档..."

# 必需文件列表
required_files=(
  ".ai/CONTEXT.md"
  ".ai/FAQ.md"
  ".ai/CHANGELOG.md"
  ".ai/self-check.md"
  ".ai/guides/api-workflow.md"
  ".ai/guides/adding-api-endpoint.md"
  ".ai/guides/creating-component.md"
  ".ai/guides/troubleshooting.md"
  ".ai/guides/best-practices.md"
)

# 检查文件是否存在
missing_files=()
for file in "${required_files[@]}"; do
  if [ ! -f "$file" ]; then
    missing_files+=("$file")
  fi
done

if [ ${#missing_files[@]} -gt 0 ]; then
  echo "❌ 缺少以下文件："
  for file in "${missing_files[@]}"; do
    echo "   - $file"
  done
  exit 1
fi

echo "✅ 所有必需文件存在"

# 检查文档大小
echo ""
echo "📏 检查文档大小..."

check_file_size() {
  local file=$1
  local max_lines=$2
  local lines=$(wc -l < "$file")
  
  if [ $lines -gt $max_lines ]; then
    echo "❌ $file 太大: $lines 行 (最大 $max_lines 行)"
    return 1
  else
    echo "✅ $file: $lines 行 (最大 $max_lines 行)"
    return 0
  fi
}

all_sizes_ok=true

# CONTEXT.md 应 <300 行
if ! check_file_size ".ai/CONTEXT.md" 300; then
  all_sizes_ok=false
fi

# FAQ.md 应 <300 行
if ! check_file_size ".ai/FAQ.md" 300; then
  all_sizes_ok=false
fi

# 任务指南应 <600 行（如需更长内容请考虑拆分成多篇指南）
for guide in .ai/guides/*.md; do
  if ! check_file_size "$guide" 600; then
    all_sizes_ok=false
  fi
done

# self-check.md 应 <200 行
if ! check_file_size ".ai/self-check.md" 200; then
  all_sizes_ok=false
fi

if [ "$all_sizes_ok" = false ]; then
  echo ""
  echo "❌ 部分文档超过大小限制"
  exit 1
fi

echo ""
echo "✅ 所有文档大小符合要求"
echo ""
echo "🎉 AI 文档验证通过！"
