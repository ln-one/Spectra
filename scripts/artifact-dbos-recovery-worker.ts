import * as nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const phase = process.env.ARTIFACT_DBOS_RECOVERY_PHASE;
  if (
    phase !== "complete" &&
    phase !== "long" &&
    phase !== "pause-generating" &&
    phase !== "pause-finalizing"
  ) {
    throw new Error("ARTIFACT_DBOS_RECOVERY_PHASE is invalid");
  }
  const longDelayMs = Number.parseInt(
    process.env.ARTIFACT_DBOS_LONG_DELAY_MS ?? String(25 * 60 * 1_000),
    10,
  );
  if (!Number.isSafeInteger(longDelayMs) || longDelayMs < 1) {
    throw new Error("ARTIFACT_DBOS_LONG_DELAY_MS is invalid");
  }

  const { DBOS } = await import("@dbos-inc/dbos-sdk");
  const { database, productPool } = await import("@/database/client");
  const { databasePoolProfiles } = await import("@/database/pool-profiles");
  const { databaseUrl } = await import("@/database/url");
  const { ARTIFACT_DBOS_SCHEMA } = await import("@/features/artifacts/dbos-queue.server");
  const { TEACHING_DOCUMENT_DBOS_QUEUE } = await import("@/features/artifacts/documents/dbos");
  const { registerTeachingDocumentDbosWorkflow } = await import(
    "@/features/artifacts/documents/dbos-worker"
  );
  const { setTimeout: delay } = await import("node:timers/promises");

  function waitForTermination() {
    return new Promise<never>(() => undefined);
  }

  const markdown = [
    "# Recovered teaching document",
    "## Recovery heading",
    "Recovery paragraph.",
    "- Recovery bullet.",
    "Recovery conclusion.",
  ].join("\n\n");

  registerTeachingDocumentDbosWorkflow({
    beforeFinalize: async () => {
      if (phase === "pause-finalizing") await waitForTermination();
    },
    db: database,
    generateDraft: async (input) => {
      const firstBreak = Math.floor(markdown.length / 3);
      const secondBreak = Math.floor((markdown.length * 2) / 3);
      await input.onTextDelta(markdown.slice(0, firstBreak));
      if (phase === "pause-generating") {
        await input.onTextDelta(markdown.slice(firstBreak, secondBreak));
        await waitForTermination();
      }
      if (phase === "long") await delay(longDelayMs);
      await input.onTextDelta(markdown.slice(firstBreak));
      return {
        markdown,
        outcome: "complete",
        usage: {
          finishReason: "stop",
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        },
      };
    },
    generationStep: {
      timeoutMS: phase === "long" ? longDelayMs + 60_000 : 60_000,
    },
    pool: productPool,
  });

  DBOS.setConfig({
    listenQueues: [TEACHING_DOCUMENT_DBOS_QUEUE],
    name: "spectra-artifact-recovery-test",
    runAdminServer: false,
    systemDatabasePoolSize: databasePoolProfiles.artifactWorkflowSystem.max,
    systemDatabaseSchemaName: ARTIFACT_DBOS_SCHEMA,
    systemDatabaseUrl: databaseUrl(),
    tracingEnabled: false,
    useListenNotify: true,
  });
  await DBOS.launch();

  let stopping: Promise<void> | undefined;
  function stop() {
    stopping ??= (async () => {
      try {
        await DBOS.shutdown({ deregister: true });
      } finally {
        await productPool.end();
      }
    })();
    return stopping;
  }

  process.once("SIGINT", () => void stop().then(() => process.exit(0)));
  process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
  console.log("DBOS recovery test worker ready");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
