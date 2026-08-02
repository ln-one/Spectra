import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as nextEnv from "@next/env";
import { z } from "zod";
import { serverEnvironment } from "@/environment/server";
import {
  animationAuthoringInputs,
  animationAuthoringInstruction,
} from "@/features/artifacts/animations/authoring-input";
import { animationGenerationRequestSchema } from "@/features/artifacts/animations/contract";
import { runAnimationPipeline } from "@/features/artifacts/animations/pipeline.server";
import {
  presentationAuthoringInputs,
  presentationAuthoringInstruction,
} from "@/features/artifacts/presentations/authoring-input";
import { presentationGenerationRequestSchema } from "@/features/artifacts/presentations/contract";
import { runPresentationPipeline } from "@/features/artifacts/presentations/pipeline.server";
import { openHandsAuthoringEnvironment } from "@/features/artifacts/task-agent/config.server";
import {
  createOpenHandsAuthoringClient,
  stableTaskAgentConversationId,
} from "@/features/artifacts/task-agent/openhands-client.server";

const argumentsSchema = z.object({
  kind: z.enum(["animation", "presentation"]),
  runs: z.number().int().min(1).max(10),
});

function argumentsFromCommandLine() {
  const values = new Map(
    process.argv.slice(2).map((argument) => {
      const [name, value] = argument.replace(/^--/, "").split("=", 2);
      return [name, value] as const;
    }),
  );
  return argumentsSchema.parse({
    kind: values.get("kind"),
    runs: Number(values.get("runs") ?? "1"),
  });
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function eventTime(event: Record<string, unknown>) {
  for (const key of ["timestamp", "created_at", "createdAt"]) {
    const value = event[key];
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  }
  return null;
}

async function waitForCompletion(input: {
  client: ReturnType<typeof createOpenHandsAuthoringClient>;
  conversationId: string;
  deadlineAt: string;
  pollIntervalMs: number;
}) {
  let firstEventAt: string | null = null;
  while (Date.now() < Date.parse(input.deadlineAt)) {
    const conversation = await input.client.getConversation({
      conversationId: input.conversationId,
      deadlineAt: input.deadlineAt,
    });
    if (!conversation.found) throw new Error("openhands_conversation_lost");
    if (conversation.status === "finished") return { firstEventAt };
    if (["error", "stuck"].includes(conversation.status)) {
      throw new Error(`openhands_terminal_${conversation.status}`);
    }
    if (!firstEventAt) {
      const events = await input.client.listEvents({
        conversationId: input.conversationId,
        deadlineAt: input.deadlineAt,
        limit: 10,
      });
      firstEventAt = events.items.map(eventTime).find((value) => value !== null) ?? null;
    }
    await sleep(input.pollIntervalMs);
  }
  throw new Error("task_agent_deadline_exceeded");
}

async function uploadInputs(
  client: ReturnType<typeof createOpenHandsAuthoringClient>,
  workspacePath: string,
  deadlineAt: string,
  files: Array<{ body: Uint8Array; contentType: string; path: string }>,
) {
  for (const file of files) {
    await client.uploadFile({
      body: file.body,
      contentType: file.contentType,
      deadlineAt,
      path: `${workspacePath}/${file.path}`,
    });
  }
}

async function runPresentation(runNumber: number) {
  const attemptId = randomUUID();
  const environment = openHandsAuthoringEnvironment(
    serverEnvironment(),
    "presentation-pptd-v1",
    attemptId,
  );
  const client = createOpenHandsAuthoringClient(environment);
  const conversationId = stableTaskAgentConversationId(environment.recipeVersion, attemptId);
  const workspacePath = `${environment.workspaceRoot}/acceptance/${attemptId}`;
  const deadlineAt = new Date(Date.now() + environment.maxDurationMs).toISOString();
  const request = presentationGenerationRequestSchema.parse({
    locale: "zh-CN",
    prompt: `制作一份简洁的 3 页中文演示文稿，主题是“稳定的长任务系统”。第 ${runNumber} 次验收。包含标题页、职责边界页和结论页。`,
    recipe: "presentation-pptd-v1",
  });
  const authoring = presentationAuthoringInputs(request);
  console.log(JSON.stringify({ attemptId, conversationId, status: "provisioned" }));
  await uploadInputs(client, workspacePath, deadlineAt, [
    { body: authoring.brief, contentType: "application/json", path: "brief.json" },
    ...authoring.evidence.map((file) => ({ ...file, contentType: "text/markdown" })),
  ]);
  const startedAt = new Date().toISOString();
  await client.createConversation({
    conversationId,
    deadlineAt,
    instruction: presentationAuthoringInstruction(),
    workspacePath,
  });
  const terminal = await waitForCompletion({
    client,
    conversationId,
    deadlineAt,
    pollIntervalMs: environment.pollIntervalMs,
  });
  const downloaded = await client.downloadArchive({
    deadlineAt,
    path: `${workspacePath}/out`,
  });
  const result = await runPresentationPipeline({
    archive: downloaded.archive,
    summary: request.prompt,
  });
  const outputDirectory = path.join(process.cwd(), "output/task-agent-live", attemptId);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "source.tar.gz"), result.sourceArchive);
  return {
    attemptId,
    conversationId,
    firstEventAt: terminal.firstEventAt,
    outputDirectory,
    pageCount: result.content.pageCount,
    pageTitles: result.content.pageTitles,
    startedAt,
    succeededAt: new Date().toISOString(),
    title: result.content.title,
  };
}

async function runAnimation(runNumber: number) {
  const attemptId = randomUUID();
  const environment = openHandsAuthoringEnvironment(
    serverEnvironment(),
    "animation-remotion-v1",
    attemptId,
  );
  const client = createOpenHandsAuthoringClient(environment);
  const conversationId = stableTaskAgentConversationId(environment.recipeVersion, attemptId);
  const workspacePath = `${environment.workspaceRoot}/acceptance/${attemptId}`;
  const deadlineAt = new Date(Date.now() + environment.maxDurationMs).toISOString();
  const request = animationGenerationRequestSchema.parse({
    durationSeconds: 15,
    locale: "zh-CN",
    prompt: `制作一个清晰克制的动态图解，展示 Skill、OpenHands、DBOS、Spectra 的职责边界。第 ${runNumber} 次验收。`,
    recipe: "animation-remotion-v1",
  });
  const authoring = animationAuthoringInputs(request);
  console.log(JSON.stringify({ attemptId, conversationId, status: "provisioned" }));
  await uploadInputs(client, workspacePath, deadlineAt, [
    { body: authoring.brief, contentType: "application/json", path: "brief.json" },
    ...authoring.evidence.map((file) => ({ ...file, contentType: "text/markdown" })),
  ]);
  const startedAt = new Date().toISOString();
  await client.createConversation({
    conversationId,
    deadlineAt,
    instruction: animationAuthoringInstruction(),
    workspacePath,
  });
  const terminal = await waitForCompletion({
    client,
    conversationId,
    deadlineAt,
    pollIntervalMs: environment.pollIntervalMs,
  });
  const downloaded = await client.downloadArchive({
    deadlineAt,
    path: `${workspacePath}/out`,
  });
  const result = await runAnimationPipeline({
    archive: downloaded.archive,
    summary: request.prompt,
    title: "稳定的长任务系统",
  });
  const outputDirectory = path.join(process.cwd(), "output/task-agent-live", attemptId);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, "source.tar.gz"), result.sourceArchive),
    writeFile(path.join(outputDirectory, "animation.mp4"), result.mp4),
  ]);
  return {
    attemptId,
    composition: result.content,
    conversationId,
    firstEventAt: terminal.firstEventAt,
    outputDirectory,
    startedAt,
    succeededAt: new Date().toISOString(),
  };
}

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const input = argumentsFromCommandLine();
  const results: unknown[] = [];
  for (let run = 1; run <= input.runs; run += 1) {
    console.log(JSON.stringify({ kind: input.kind, run, status: "started" }));
    const result =
      input.kind === "presentation" ? await runPresentation(run) : await runAnimation(run);
    results.push(result);
    console.log(JSON.stringify({ kind: input.kind, result, run, status: "succeeded" }));
  }
  console.log(JSON.stringify({ kind: input.kind, results, status: "complete" }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
