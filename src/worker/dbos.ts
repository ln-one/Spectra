import * as nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const { serverEnvironment, validateWorkerEnvironment } = await import("../environment/server");
  const environment = validateWorkerEnvironment(serverEnvironment());
  const { shutdownApplicationTracing, startApplicationTracing } = await import(
    "../observability/tracing.server"
  );
  startApplicationTracing("spectra-worker", environment);
  const [
    database,
    { databaseUrl },
    { initializeDbosSystem },
    { flushApplicationLogger, workerLogger },
    { createDbosHealthServer },
    { readDbosQueueHealth },
    { startDbosRuntime, stopDbosRuntime },
  ] = await Promise.all([
    import("../database/client"),
    import("../database/url"),
    import("./dbos-system.server"),
    import("../observability/server"),
    import("./dbos-health-http.server"),
    import("./dbos-health.server"),
    import("./dbos-runtime.server"),
  ]);
  const healthServer = createDbosHealthServer({ port: environment.WORKER_HEALTH_PORT });
  workerLogger.info({ event: "worker.lifecycle.starting" }, "Spectra DBOS worker is starting");
  let shutdownPromise: Promise<void> | undefined;
  let queueHealthTimer: NodeJS.Timeout | undefined;

  async function refreshQueueHealth() {
    try {
      const health = await readDbosQueueHealth(database.productPool);
      healthServer.setQueueHealth(health);
      workerLogger.info(
        {
          errorCount: health.errorCount,
          event: "dbos.queue.health",
          maintenanceOldestAgeMs: health.maintenanceOldestAgeMs,
          maxRecoveryAttemptsExceededCount: health.maxRecoveryAttemptsExceededCount,
          nonTerminalWorkflowCount: health.nonTerminalWorkflowCount,
          queueCount: health.queues.length,
        },
        "DBOS queue health snapshot",
      );
      return health;
    } catch (error) {
      healthServer.setQueueHealthError();
      workerLogger.error(
        {
          errorName: error instanceof Error ? error.name : "unknown",
          event: "dbos.queue.health.failed",
        },
        "DBOS queue health snapshot failed",
      );
      throw error;
    }
  }

  function shutdown() {
    shutdownPromise ??= (async () => {
      workerLogger.info({ event: "worker.lifecycle.stopping" }, "Spectra DBOS worker is stopping");
      const failures: unknown[] = [];
      if (queueHealthTimer) clearInterval(queueHealthTimer);
      healthServer.setRuntimeReady(false);
      try {
        await healthServer.close();
      } catch (error) {
        failures.push(error);
      }
      try {
        await stopDbosRuntime();
      } catch (error) {
        failures.push(error);
      }
      try {
        await database.productPool.end();
      } catch (error) {
        failures.push(error);
      }
      try {
        await shutdownApplicationTracing();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 0) {
        workerLogger.info({ event: "worker.lifecycle.stopped" }, "Spectra DBOS worker stopped");
      }
      try {
        await flushApplicationLogger(workerLogger);
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, "Worker shutdown failed");
    })();
    return shutdownPromise;
  }
  let stopRequested = false;
  let startupPromise = Promise.resolve();
  const stopForSignal = () => {
    if (stopRequested) return;
    stopRequested = true;
    void (async () => {
      const failures: unknown[] = [];
      try {
        await startupPromise;
      } catch (error) {
        failures.push(error);
      }
      try {
        await shutdown();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 0) {
        process.exit(0);
      } else {
        const error =
          failures.length === 1
            ? failures[0]
            : new AggregateError(failures, "Worker failed while stopping");
        workerLogger.error(
          { error, event: "worker.lifecycle.shutdown_failed" },
          "Spectra DBOS worker shutdown failed",
        );
        await flushApplicationLogger(workerLogger).catch(() => undefined);
        process.exit(1);
      }
    })();
  };
  process.once("SIGINT", stopForSignal);
  process.once("SIGTERM", stopForSignal);
  startupPromise = (async () => {
    if (stopRequested) return;
    await healthServer.listen();
    if (stopRequested) return;
    if (environment.NODE_ENV !== "production") {
      await initializeDbosSystem({ connectionString: databaseUrl(environment) });
    }
    if (stopRequested) return;
    await startDbosRuntime(environment);
    if (stopRequested) return;
    await refreshQueueHealth();
    healthServer.setRuntimeReady(true);
    queueHealthTimer = setInterval(() => {
      void refreshQueueHealth().catch(() => undefined);
    }, 30_000);
    queueHealthTimer.unref();
  })();
  try {
    await startupPromise;
  } catch (error) {
    if (stopRequested) return;
    await shutdown().catch((shutdownError: unknown) => {
      workerLogger.error(
        { error: shutdownError, event: "worker.lifecycle.startup_cleanup_failed" },
        "Spectra DBOS worker startup cleanup failed",
      );
    });
    throw error;
  }
  if (stopRequested) return;
  workerLogger.info({ event: "worker.lifecycle.ready" }, "Spectra DBOS worker is ready");
}

void main().catch(async (error: unknown) => {
  const [{ flushApplicationLogger, workerLogger }, { shutdownApplicationTracing }] =
    await Promise.all([
      import("../observability/server"),
      import("../observability/tracing.server"),
    ]);
  workerLogger.fatal(
    { error, event: "worker.lifecycle.fatal" },
    "Spectra DBOS worker stopped unexpectedly",
  );
  await flushApplicationLogger(workerLogger).catch(() => undefined);
  await shutdownApplicationTracing().catch(() => undefined);
  process.exit(1);
});
