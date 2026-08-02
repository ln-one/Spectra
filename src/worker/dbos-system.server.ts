import "server-only";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { DrizzleDataSource } from "@dbos-inc/drizzle-datasource";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";
import { DbosPinoLogger } from "@/observability/dbos.server";
import { createApplicationLogger } from "@/observability/server";
import { DBOS_QUEUES } from "./dbos-queues.server";

export async function initializeDbosSystem(input: { connectionString: string; poolSize?: number }) {
  DBOS.setConfig({
    executorID: "spectra-worker-setup",
    listenQueues: [],
    logger: new DbosPinoLogger(createApplicationLogger("spectra-worker-setup")),
    name: "spectra-worker-setup",
    otelAttributeFormat: "semconv",
    runAdminServer: false,
    systemDatabaseSchemaName: ARTIFACT_DBOS_SCHEMA,
    systemDatabaseUrl: input.connectionString,
    systemDatabasePoolSize: input.poolSize ?? 2,
    tracingEnabled: false,
  });
  await DBOS.launch();
  try {
    for (const queue of DBOS_QUEUES) {
      await DBOS.registerQueue(queue.name, {
        onConflict: "always_update",
        workerConcurrency: queue.workerConcurrency,
      });
    }
  } finally {
    await DBOS.shutdown({ deregister: true });
  }
  await DrizzleDataSource.initializeDBOSSchema(
    { connectionString: input.connectionString },
    ARTIFACT_DBOS_SCHEMA,
  );
}
