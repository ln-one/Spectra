#!/bin/bash
# post-phase.sh - Phase 完成后自动执行的文档更新与提交脚本
# 用法: ./scripts/post-phase.sh <phase_number>
# 示例: ./scripts/post-phase.sh 2

set -e

PHASE="${1:?用法: $0 <phase_number>}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BRANCH=$(git branch --show-current)
echo "[post-phase] Branch: $BRANCH | Phase: $PHASE"

# 1. 更新 requirements 相关文件（如果有变更）
DEPS_FILES=""
for f in backend/requirements.txt backend/requirements-dev.txt; do
    if git diff --name-only | grep -q "$f" 2>/dev/null; then
        DEPS_FILES="$DEPS_FILES $f"
    fi
    if git diff --cached --name-only | grep -q "$f" 2>/dev/null; then
        DEPS_FILES="$DEPS_FILES $f"
    fi
done

# 2. 收集所有已变更的文件（排除 CLAUDE.md 和 MEMBER_D_TASKS.md）
CHANGED_FILES=$(git diff --name-only; git diff --cached --name-only; git ls-files --others --exclude-standard)
COMMIT_FILES=""
for f in $CHANGED_FILES; do
    case "$f" in
        CLAUDE.md|MEMBER_D_TASKS.md|.claude/*|scripts/post-phase.sh)
            # 跳过这些文件
            ;;
        *)
            if [ -f "$f" ]; then
                COMMIT_FILES="$COMMIT_FILES $f"
            fi
            ;;
    esac
done

if [ -z "$COMMIT_FILES" ]; then
    echo "[post-phase] No files to commit (excluding CLAUDE.md, MEMBER_D_TASKS.md)"
    exit 0
fi

# 3. Stage 并提交
echo "[post-phase] Staging files..."
echo "$COMMIT_FILES" | tr ' ' '\n' | sort -u | while read -r f; do
    [ -n "$f" ] && git add "$f"
done

echo "[post-phase] Committing..."
git commit -m "docs(rag): update dependencies and docs after Phase $PHASE

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

# 4. 推送到远程
echo "[post-phase] Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

echo "[post-phase] Done."
