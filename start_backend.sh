#!/bin/bash

set -euo pipefail

# Spectra 后端启动脚本
# 停止旧进程并启动新的后端服务（固定使用 backend/venv）

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_BIN="$BACKEND_DIR/venv/bin"
UVICORN="$VENV_BIN/uvicorn"
PRISMA="$VENV_BIN/prisma"
PID_FILE="/tmp/spectra_backend.pid"

if [ ! -x "$UVICORN" ]; then
  echo "错误: 未找到后端虚拟环境，请先执行:"
  echo "  cd backend && python3.11 -m venv venv && ./venv/bin/pip install -r requirements.txt"
  exit 1
fi

echo "停止旧的后端进程..."
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" || true)"
  if [ -n "${OLD_PID}" ] && ps -p "$OLD_PID" >/dev/null 2>&1; then
    CMDLINE="$(ps -p "$OLD_PID" -o command= || true)"
    if echo "$CMDLINE" | grep -Fq "$UVICORN main:app"; then
      kill "$OLD_PID" 2>/dev/null || true
      echo "已停止 PID $OLD_PID"
    fi
  fi
  rm -f "$PID_FILE"
else
  echo "没有运行中的后端进程"
fi

cd "$BACKEND_DIR"
export PATH="$VENV_BIN:$PATH"

echo "同步 Prisma Client 与数据库..."
"$PRISMA" generate >/tmp/spectra_prisma_generate.log 2>&1
"$PRISMA" db push >/tmp/spectra_prisma_dbpush.log 2>&1

echo "启动后端服务..."
echo "$$" > "$PID_FILE"
exec "$UVICORN" main:app --reload --host 0.0.0.0 --port 8000
