"""
TaskRecoveryService - 任务执行层恢复与幂等保护（C1）

解决：worker 重启后 processing 状态任务悬空、重复执行、session 关联丢失等问题。

验收（来自 MEMBER_C_IMPLEMENTATION_PLAN.md C1）：
1. worker 异常退出后任务可恢复或失败可解释。
2. 同一个 session 重复执行请求不会导致重复写入。
3. 服务重启后任务状态可追踪，失败任务可重放。
4. GenerationTask 可按 session_id 查询执行历史。
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from prisma import Prisma
else:
    Prisma = Any

# 超时阈值：processing 状态超过此时间视为疑似僵死
STALE_PROCESSING_THRESHOLD_MINUTES = 30


class TaskRecoveryService:
    """
    任务恢复扫描器（C1）。

    典型调用时机：
    - worker 启动时执行一次（扫描上次崩溃遗留任务）。
    - 定时健康检查（可选）。
    """

    def __init__(self, db: Prisma):
        self._db = db

    # ----------------------------------------------------------
    # 1. 启动恢复扫描
    # ----------------------------------------------------------

    async def recover_stale_tasks(self, dry_run: bool = False) -> dict:
        """
        扫描并恢复僵死任务。

        规则：
        - processing 状态且 updatedAt 超过 STALE_PROCESSING_THRESHOLD_MINUTES 的任务
          视为 worker 崩溃遗留，标记为 failed + errorMessage 说明可重试。
        - 若任务关联了 session，同步将 session 标记为 FAILED（可恢复）。

        Args:
            dry_run: 为 True 时只扫描不写库（用于检查）

        Returns:
            {"scanned": int, "recovered": int, "session_updated": int}
        """
        threshold = datetime.now(timezone.utc) - timedelta(
            minutes=STALE_PROCESSING_THRESHOLD_MINUTES
        )

        stale_tasks = await self._db.generationtask.find_many(
            where={
                "status": "processing",
                "updatedAt": {"lt": threshold},
            }
        )

        scanned = len(stale_tasks)
        recovered = 0
        session_updated = 0

        for task in stale_tasks:
            logger.warning(
                "Stale task detected: id=%s project=%s session=%s updatedAt=%s",
                task.id,
                task.projectId,
                task.sessionId,
                task.updatedAt,
            )
            if dry_run:
                recovered += 1
                continue

            # 标记任务失败（可重试）
            await self._db.generationtask.update(
                where={"id": task.id},
                data={
                    "status": "failed",
                    "errorMessage": (
                        "[TaskRecovery] Worker 进程中断，任务未完成。"
                        "可通过 session resume 重新发起。"
                    ),
                },
            )
            recovered += 1

            # 同步 session 状态
            if task.sessionId:
                session = await self._db.generationsession.find_unique(
                    where={"id": task.sessionId}
                )
                if session and session.state not in ("SUCCESS", "FAILED"):
                    await self._db.generationsession.update(
                        where={"id": task.sessionId},
                        data={
                            "state": "FAILED",
                            "resumable": True,
                            "errorCode": "WORKER_INTERRUPTED",
                            "errorMessage": "执行进程中断，可通过恢复继续。",
                            "errorRetryable": True,
                        },
                    )
                    # 追加恢复事件并同步 lastCursor
                    cursor = str(uuid.uuid4())
                    await self._db.sessionevent.create(
                        data={
                            "sessionId": task.sessionId,
                            "eventType": "task.failed",
                            "state": "FAILED",
                            "stateReason": "worker_interrupted",
                            "cursor": cursor,
                            "payload": json.dumps(
                                {"reason": "WORKER_INTERRUPTED", "retryable": True}
                            ),
                            "schemaVersion": 1,
                        }
                    )
                    await self._db.generationsession.update(
                        where={"id": task.sessionId},
                        data={"lastCursor": cursor},
                    )
                    session_updated += 1

        logger.info(
            "TaskRecovery: scanned=%d recovered=%d session_updated=%d dry_run=%s",
            scanned,
            recovered,
            session_updated,
            dry_run,
        )
        return {
            "scanned": scanned,
            "recovered": recovered,
            "session_updated": session_updated,
        }

    # ----------------------------------------------------------
    # 2. 幂等保护：同一 session 防重复执行
    # ----------------------------------------------------------

    async def is_session_already_running(self, session_id: str) -> bool:
        """
        检查同一 session 是否已有 processing 任务在执行。
        防止重复执行（幂等保护）。
        """
        count = await self._db.generationtask.count(
            where={
                "sessionId": session_id,
                "status": {"in": ["processing", "pending"]},
            }
        )
        return count > 0

    # ----------------------------------------------------------
    # 3. 按 session_id 查询执行历史（验收项 4）
    # ----------------------------------------------------------

    async def get_tasks_by_session(
        self,
        session_id: str,
        include_failed: bool = True,
    ) -> list:
        """
        返回 session 关联的所有任务（按创建时间降序）。
        """
        where: dict = {"sessionId": session_id}
        if not include_failed:
            where["status"] = {"not": "failed"}

        return await self._db.generationtask.find_many(
            where=where,
            order={"createdAt": "desc"},
        )

    # ----------------------------------------------------------
    # 4. 重放失败任务（将 failed 重置为 pending，供 worker 再次拾取）
    # ----------------------------------------------------------

    async def replay_failed_task(self, task_id: str) -> bool:
        """
        将 failed 任务重置为 pending，以便 worker 重新拾取。

        Returns:
            True 表示重置成功，False 表示任务不存在或状态不是 failed。
        """
        task = await self._db.generationtask.find_unique(where={"id": task_id})
        if not task or task.status != "failed":
            return False

        await self._db.generationtask.update(
            where={"id": task_id},
            data={
                "status": "pending",
                "retryCount": task.retryCount + 1,
                "errorMessage": None,
                "rqJobId": None,
            },
        )
        logger.info("Task %s replayed (retry #%d)", task_id, task.retryCount + 1)
        return True
