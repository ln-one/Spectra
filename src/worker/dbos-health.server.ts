import "server-only";

import type { Pool } from "pg";
import { DBOS_MAINTENANCE_QUEUE } from "@/database/dbos";

const terminalStatuses = ["SUCCESS", "ERROR", "CANCELLED", "MAX_RECOVERY_ATTEMPTS_EXCEEDED"];
const terminalStatusSet = new Set(terminalStatuses);

export type DbosQueueHealth = {
  errorCount: number;
  maxRecoveryAttemptsExceededCount: number;
  maintenanceOldestAgeMs: number | null;
  nonTerminalWorkflowCount: number;
  queues: Array<{
    depth: number;
    oldestPendingAgeMs: number | null;
    queueName: string;
    statuses: Array<{ count: number; status: string }>;
  }>;
  workflows: Array<{
    applicationVersion: string;
    count: number;
    oldestCreatedAt: string;
    queueName: string;
    status: string;
    workflowName: string;
  }>;
};

type DbosQueueHealthRow = {
  applicationVersion: string;
  count: number;
  oldestCreatedAt: Date | number | string;
  queueName: string | null;
  status: string;
  workflowName: string;
};

function dbosTimestamp(value: DbosQueueHealthRow["oldestCreatedAt"]) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return Date.parse(value instanceof Date ? value.toISOString() : value);
}

export async function readDbosQueueHealth(pool: Pick<Pool, "query">): Promise<DbosQueueHealth> {
  const result = await pool.query<DbosQueueHealthRow>(
    `
      SELECT
        COALESCE(application_version, 'unknown') AS "applicationVersion",
        COUNT(*)::int AS "count",
        MIN(created_at) AS "oldestCreatedAt",
        COALESCE(queue_name, 'default') AS "queueName",
        status,
        name AS "workflowName"
      FROM dbos.workflow_status
      WHERE status IS NOT NULL
      GROUP BY application_version, queue_name, status, name
      ORDER BY MIN(created_at), queue_name, name, status, application_version
    `,
  );
  return summarizeDbosQueueHealth(result.rows);
}

export function summarizeDbosQueueHealth(
  rows: readonly DbosQueueHealthRow[],
  now = Date.now(),
): DbosQueueHealth {
  const workflows = rows.flatMap((row) => {
    const createdAt = dbosTimestamp(row.oldestCreatedAt);
    if (!Number.isFinite(createdAt)) return [];
    return [
      {
        applicationVersion: row.applicationVersion,
        count: row.count,
        oldestCreatedAt: new Date(createdAt).toISOString(),
        queueName: row.queueName ?? "default",
        status: row.status,
        workflowName: row.workflowName,
      },
    ];
  });
  const queues = new Map<
    string,
    {
      depth: number;
      oldestPendingAt: number | null;
      statuses: Map<string, number>;
    }
  >();
  let errorCount = 0;
  let maxRecoveryAttemptsExceededCount = 0;
  let nonTerminalWorkflowCount = 0;

  for (const workflow of workflows) {
    const queue =
      queues.get(workflow.queueName) ??
      (() => {
        const created = { depth: 0, oldestPendingAt: null, statuses: new Map<string, number>() };
        queues.set(workflow.queueName, created);
        return created;
      })();
    queue.statuses.set(
      workflow.status,
      (queue.statuses.get(workflow.status) ?? 0) + workflow.count,
    );
    if (workflow.status === "ERROR") errorCount += workflow.count;
    if (workflow.status === "MAX_RECOVERY_ATTEMPTS_EXCEEDED") {
      maxRecoveryAttemptsExceededCount += workflow.count;
    }
    if (!terminalStatusSet.has(workflow.status)) {
      nonTerminalWorkflowCount += workflow.count;
      queue.depth += workflow.count;
      const createdAt = Date.parse(workflow.oldestCreatedAt);
      if (Number.isFinite(createdAt)) {
        queue.oldestPendingAt =
          queue.oldestPendingAt === null ? createdAt : Math.min(queue.oldestPendingAt, createdAt);
      }
    }
  }
  const maintenanceOldest = workflows
    .filter(
      (workflow) =>
        workflow.queueName === DBOS_MAINTENANCE_QUEUE && !terminalStatusSet.has(workflow.status),
    )
    .map((workflow) => Date.parse(workflow.oldestCreatedAt))
    .filter(Number.isFinite)
    .reduce<number | null>(
      (oldest, createdAt) => (oldest === null ? createdAt : Math.min(oldest, createdAt)),
      null,
    );
  return {
    errorCount,
    maxRecoveryAttemptsExceededCount,
    maintenanceOldestAgeMs:
      maintenanceOldest === null ? null : Math.max(0, now - maintenanceOldest),
    nonTerminalWorkflowCount,
    queues: [...queues.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([queueName, queue]) => ({
        depth: queue.depth,
        oldestPendingAgeMs:
          queue.oldestPendingAt === null ? null : Math.max(0, now - queue.oldestPendingAt),
        queueName,
        statuses: [...queue.statuses.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([status, count]) => ({ count, status })),
      })),
    workflows,
  };
}

export function dbosQueueHealthUnhealthy(
  health: DbosQueueHealth,
  maxMaintenanceAgeMs = 10 * 60 * 1_000,
) {
  return (
    (health.maintenanceOldestAgeMs !== null &&
      health.maintenanceOldestAgeMs > maxMaintenanceAgeMs) ||
    health.maxRecoveryAttemptsExceededCount > 0
  );
}
