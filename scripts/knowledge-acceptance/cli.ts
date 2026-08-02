import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { runKnowledgeAcceptance } from "./runner";

loadEnvConfig(process.cwd());

const argumentSchema = z
  .object({
    mode: z.enum(["offline", "live"]),
    keepState: z.boolean(),
  })
  .strict();

function parseArguments(argv: string[]) {
  let mode: "offline" | "live" | undefined;
  let keepState = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--keep-state") {
      keepState = true;
      continue;
    }
    if (argument === "--mode") {
      const value = argv[index + 1];
      if (value !== "offline" && value !== "live") throw new Error("invalid --mode");
      mode = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return argumentSchema.parse({ mode, keepState });
}

async function main() {
  const input = parseArguments(process.argv.slice(2));
  const result = await runKnowledgeAcceptance(input);
  console.log(
    JSON.stringify(
      {
        status: "ok",
        mode: input.mode,
        reportDirectory: result.directory,
        hardGatePassed: result.report.aggregate.hardGatePassed,
        sourceRecallAt20: result.report.aggregate.sourceRecallAt20,
        hitAt10: result.report.aggregate.hitAt10,
        evidenceHitRate: result.report.aggregate.evidenceHitRate,
        exactMismatchCount: result.report.aggregate.exactMismatchCount,
        ...(input.keepState
          ? { databaseName: result.databaseName, collection: result.collection }
          : {}),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
