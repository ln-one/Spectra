#!/bin/bash

set -euo pipefail

# Spectra 后端启动脚本
# 停止旧进程并启动新的后端服务（固定使用 backend/venv）

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_BIN="$BACKEND_DIR/venv/bin"
UVICORN="$VENV_BIN/uvicorn"
PRISMA="$VENV_BIN/prisma"

if [ ! -x "$UVICORN" ]; then
  echo "错误: 未找到后端虚拟环境，请先执行:"
  echo "  cd backend && python3.11 -m venv venv && ./venv/bin/pip install -r requirements.txt"
  exit 1
fi

echo "停止旧的后端进程..."
pkill -f "uvicorn main:app" 2>/dev/null || echo "没有运行中的后端进程"

cd "$BACKEND_DIR"
export PATH="$VENV_BIN:$PATH"

echo "同步 Prisma Client 与数据库..."
"$PRISMA" generate >/tmp/spectra_prisma_generate.log 2>&1
"$PRISMA" db push >/tmp/spectra_prisma_dbpush.log 2>&1

echo "启动后端服务..."
exec "$UVICORN" main:app --reload --host 0.0.0.0 --port 8000
