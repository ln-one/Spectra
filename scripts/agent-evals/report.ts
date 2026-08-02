import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const scoreSchema = z.record(z.string(), z.number().finite());

const agentEvalCaseResultSchema = z
  .object({
    id: z.string().trim().min(1),
    durationMs: z.number().nonnegative(),
    passed: z.boolean(),
    scores: scoreSchema.optional(),
    failureCode: z
      .string()
      .regex(/^[a-z0-9_]{1,100}$/)
      .optional(),
  })
  .strict();

export type AgentEvalCaseResult = z.infer<typeof agentEvalCaseResultSchema>;

const agentEvalReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().uuid(),
    createdAt: z.iso.datetime(),
    mode: z.enum(["offline", "live"]),
    modelId: z.string().trim().min(1),
    judgeModelId: z.string().trim().min(1).optional(),
    passed: z.boolean(),
    cases: z.array(agentEvalCaseResultSchema).min(1),
  })
  .strict();

function renderMarkdown(report: z.infer<typeof agentEvalReportSchema>) {
  const lines = [
    `# Agent evaluation — ${report.runId}`,
    "",
    `- Mode: \`${report.mode}\``,
    `- Model: \`${report.modelId}\``,
    ...(report.judgeModelId ? [`- Judge model: \`${report.judgeModelId}\``] : []),
    `- Result: **${report.passed ? "PASS" : "FAIL"}**`,
    "",
    "| Case | Result | Duration | Scores | Failure |",
    "| --- | --- | ---: | --- | --- |",
    ...report.cases.map((result) => {
      const scores = Object.entries(result.scores ?? {})
        .map(([name, value]) => `${name}=${value.toFixed(3)}`)
        .join(", ");
      return `| ${result.id} | ${result.passed ? "PASS" : "FAIL"} | ${result.durationMs.toFixed(0)} ms | ${scores || "n/a"} | ${result.failureCode ?? "none"} |`;
    }),
  ];
  return `${lines.join("\n")}\n`;
}

export async function writeAgentEvalReport(input: {
  mode: "offline" | "live";
  modelId: string;
  judgeModelId?: string;
  cases: AgentEvalCaseResult[];
  outputRoot?: string;
}) {
  const report = agentEvalReportSchema.parse({
    schemaVersion: 1,
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    mode: input.mode,
    modelId: input.modelId,
    ...(input.judgeModelId ? { judgeModelId: input.judgeModelId } : {}),
    passed: input.cases.every((result) => result.passed),
    cases: input.cases,
  });
  const directory = path.join(
    input.outputRoot ?? path.resolve("test-results/agent-evals"),
    `${report.mode}-${report.runId}`,
  );
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(directory, "report.md"), renderMarkdown(report), "utf8"),
  ]);
  return { directory, report };
}
