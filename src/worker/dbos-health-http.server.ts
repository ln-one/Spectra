import "server-only";

import { createServer, type Server } from "node:http";
import type { DbosQueueHealth } from "./dbos-health.server";
import { dbosQueueHealthUnhealthy } from "./dbos-health.server";

const DEFAULT_HEALTH_PORT = 8_787;
const DEFAULT_MAX_SNAPSHOT_AGE_MS = 90_000;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
} as const;

type HealthServerOptions = {
  host?: string;
  maxSnapshotAgeMs?: number;
  now?: () => number;
  port?: number;
};

type QueueHealthSnapshot = {
  health: DbosQueueHealth;
  observedAtMs: number;
};

export type DbosHealthHttpServer = {
  close: () => Promise<void>;
  listen: () => Promise<void>;
  port: () => number;
  setQueueHealth: (health: DbosQueueHealth) => void;
  setQueueHealthError: () => void;
  setRuntimeReady: (ready: boolean) => void;
};

function queueHealthResponse(health: DbosQueueHealth) {
  return {
    errorCount: health.errorCount,
    maintenanceOldestAgeMs: health.maintenanceOldestAgeMs,
    maxRecoveryAttemptsExceededCount: health.maxRecoveryAttemptsExceededCount,
    nonTerminalWorkflowCount: health.nonTerminalWorkflowCount,
    queues: health.queues,
  };
}

export function createDbosHealthServer(options: HealthServerOptions = {}): DbosHealthHttpServer {
  const now = options.now ?? Date.now;
  const host = options.host ?? "0.0.0.0";
  const maxSnapshotAgeMs = options.maxSnapshotAgeMs ?? DEFAULT_MAX_SNAPSHOT_AGE_MS;
  const port = options.port ?? DEFAULT_HEALTH_PORT;
  let runtimeReady = false;
  let queueHealthError = false;
  let queueSnapshot: QueueHealthSnapshot | null = null;
  let listenPromise: Promise<void> | null = null;
  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://worker").pathname;
    if (request.method !== "GET") {
      writeJson(response, 405, { service: "spectra-worker", status: "method_not_allowed" });
      return;
    }

    if (pathname === "/healthz") {
      writeJson(response, 200, { service: "spectra-worker", status: "ok" });
      return;
    }

    if (pathname !== "/readyz" && pathname !== "/queuez") {
      writeJson(response, 404, { service: "spectra-worker", status: "not_found" });
      return;
    }

    const snapshot =
      queueSnapshot && !queueHealthError && now() - queueSnapshot.observedAtMs <= maxSnapshotAgeMs
        ? queueSnapshot
        : null;
    if (!runtimeReady || snapshot === null) {
      writeJson(response, 503, {
        service: "spectra-worker",
        status: runtimeReady ? "unavailable" : "starting",
      });
      return;
    }

    const queue = queueHealthResponse(snapshot.health);
    if (pathname === "/readyz") {
      writeJson(response, 200, {
        checkedAt: new Date(now()).toISOString(),
        queue,
        service: "spectra-worker",
        status: "ready",
      });
      return;
    }

    const unhealthy = dbosQueueHealthUnhealthy(snapshot.health);
    writeJson(response, unhealthy ? 503 : 200, {
      checkedAt: new Date(now()).toISOString(),
      queue,
      service: "spectra-worker",
      status: unhealthy ? "unhealthy" : snapshot.health.errorCount > 0 ? "degraded" : "ok",
    });
  });

  return {
    async close() {
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    async listen() {
      if (server.listening) return;
      listenPromise ??= new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      await listenPromise;
    },
    port() {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("DBOS health server is not listening");
      }
      return address.port;
    },
    setQueueHealth(health) {
      queueHealthError = false;
      queueSnapshot = { health, observedAtMs: now() };
    },
    setQueueHealthError() {
      queueHealthError = true;
    },
    setRuntimeReady(ready) {
      runtimeReady = ready;
    },
  };
}

function writeJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, NO_STORE_HEADERS);
  response.end(JSON.stringify(body));
}
