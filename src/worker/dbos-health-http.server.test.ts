import { afterEach, expect, test } from "vitest";
import { type DbosQueueHealth, summarizeDbosQueueHealth } from "./dbos-health.server";
import { createDbosHealthServer, type DbosHealthHttpServer } from "./dbos-health-http.server";

const activeServers = new Set<DbosHealthHttpServer>();

afterEach(async () => {
  await Promise.all([...activeServers].map((server) => server.close()));
  activeServers.clear();
});

function queueHealth(): DbosQueueHealth {
  return summarizeDbosQueueHealth(
    [
      {
        applicationVersion: "current",
        count: 1,
        oldestCreatedAt: "2026-07-29T00:00:00.000Z",
        queueName: "maintenance",
        status: "ENQUEUED",
        workflowName: "convergeStaleAiRuns",
      },
    ],
    Date.parse("2026-07-29T00:10:01.000Z"),
  );
}

async function startServer(now: { value: number }) {
  const server = createDbosHealthServer({
    host: "127.0.0.1",
    now: () => now.value,
    port: 0,
  });
  activeServers.add(server);
  await server.listen();
  return server;
}

function url(server: DbosHealthHttpServer, path: string) {
  return `http://127.0.0.1:${server.port()}${path}`;
}

test("keeps liveness independent from DBOS readiness", async () => {
  const now = { value: Date.parse("2026-07-29T00:10:01.000Z") };
  const server = await startServer(now);

  const liveness = await fetch(url(server, "/healthz"));
  expect(liveness.status).toBe(200);
  await expect(liveness.json()).resolves.toEqual({ service: "spectra-worker", status: "ok" });

  const readiness = await fetch(url(server, "/readyz"));
  expect(readiness.status).toBe(503);
  await expect(readiness.json()).resolves.toEqual({
    service: "spectra-worker",
    status: "starting",
  });
});

test("reports queue health without exposing workflow inputs", async () => {
  const now = { value: Date.parse("2026-07-29T00:10:01.000Z") };
  const server = await startServer(now);
  server.setQueueHealth(queueHealth());
  server.setRuntimeReady(true);

  const response = await fetch(url(server, "/queuez"));
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body).toMatchObject({
    queue: {
      maintenanceOldestAgeMs: 601_000,
      nonTerminalWorkflowCount: 1,
      queues: [
        {
          depth: 1,
          queueName: "maintenance",
          statuses: [{ count: 1, status: "ENQUEUED" }],
        },
      ],
    },
    service: "spectra-worker",
    status: "unhealthy",
  });
  expect(JSON.stringify(body)).not.toContain("workflowName");
});

test("rejects unsupported methods and unknown probes", async () => {
  const now = { value: Date.now() };
  const server = await startServer(now);

  expect((await fetch(url(server, "/healthz"), { method: "POST" })).status).toBe(405);
  expect((await fetch(url(server, "/unknown"))).status).toBe(404);
});

test("marks a stale queue snapshot unavailable", async () => {
  const now = { value: Date.parse("2026-07-29T00:10:01.000Z") };
  const server = await startServer(now);
  server.setQueueHealth(queueHealth());
  server.setRuntimeReady(true);
  now.value += 90_001;

  expect((await fetch(url(server, "/readyz"))).status).toBe(503);
});
