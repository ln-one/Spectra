import { expect, test } from "vitest";
import { dbosQueueHealthUnhealthy, summarizeDbosQueueHealth } from "@/worker/dbos-health.server";

test("reports an unhealthy maintenance backlog only after the configured age", () => {
  const health = summarizeDbosQueueHealth(
    [
      {
        applicationVersion: "old",
        count: 2,
        oldestCreatedAt: "2026-07-29T00:00:00.000Z",
        queueName: "maintenance",
        status: "ENQUEUED",
        workflowName: "cleanupConversation",
      },
    ],
    Date.parse("2026-07-29T00:10:01.000Z"),
  );

  expect(health.maintenanceOldestAgeMs).toBe(601_000);
  expect(dbosQueueHealthUnhealthy(health)).toBe(true);
});

test("keeps non-maintenance work visible without failing the maintenance health check", () => {
  const health = summarizeDbosQueueHealth(
    [
      {
        applicationVersion: "current",
        count: 1,
        oldestCreatedAt: "2026-07-29T00:00:00.000Z",
        queueName: "knowledge-index",
        status: "PENDING",
        workflowName: "buildKnowledgeIndexGeneration",
      },
    ],
    Date.parse("2026-07-29T02:00:00.000Z"),
  );

  expect(health.maintenanceOldestAgeMs).toBeNull();
  expect(dbosQueueHealthUnhealthy(health)).toBe(false);
});

test("accepts DBOS epoch-millisecond timestamps returned by PostgreSQL", () => {
  const health = summarizeDbosQueueHealth(
    [
      {
        applicationVersion: "current",
        count: 1,
        oldestCreatedAt: "1785209881023",
        queueName: "maintenance",
        status: "ENQUEUED",
        workflowName: "convergeStaleAiRuns",
      },
    ],
    1_785_209_882_023,
  );

  expect(health.workflows[0]?.oldestCreatedAt).toBe("2026-07-28T03:38:01.023Z");
  expect(health.maintenanceOldestAgeMs).toBe(1_000);
});

test("counts terminal failures without treating them as queued work", () => {
  const health = summarizeDbosQueueHealth(
    [
      {
        applicationVersion: "current",
        count: 2,
        oldestCreatedAt: "2026-07-29T00:00:00.000Z",
        queueName: "maintenance",
        status: "MAX_RECOVERY_ATTEMPTS_EXCEEDED",
        workflowName: "cleanupArtifact",
      },
      {
        applicationVersion: "current",
        count: 3,
        oldestCreatedAt: "2026-07-29T00:01:00.000Z",
        queueName: "knowledge-index",
        status: "ERROR",
        workflowName: "buildKnowledgeIndexGeneration",
      },
    ],
    Date.parse("2026-07-29T02:00:00.000Z"),
  );

  expect(health.nonTerminalWorkflowCount).toBe(0);
  expect(health.maintenanceOldestAgeMs).toBeNull();
  expect(health.errorCount).toBe(3);
  expect(health.maxRecoveryAttemptsExceededCount).toBe(2);
  expect(dbosQueueHealthUnhealthy(health)).toBe(true);
});
