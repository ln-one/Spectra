import "server-only";

import { createHash } from "node:crypto";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { and, eq } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import type { Database } from "@/database/client";
import { artifactGenerationAttempts, artifactRevisions } from "@/database/schema";
import { publishArtifactEditProposal } from "@/features/artifacts/proposal-service.server";
import {
  type ArtifactRenderStorage,
  createArtifactRenderStorage,
} from "@/features/artifacts/render-storage.server";
import { stageArtifactSourceBundle } from "@/features/artifacts/source-bundles.server";
import {
  type OpenHandsAuthoringEnvironment,
  openHandsAuthoringEnvironment,
} from "@/features/artifacts/task-agent/config.server";
import { putImmutableArtifactObject } from "@/features/artifacts/task-agent/immutable-storage.server";
import {
  createOpenHandsAuthoringClient,
  type OpenHandsAuthoringClient,
} from "@/features/artifacts/task-agent/openhands-client.server";
import { registerTaskAgentRemoteSteps } from "@/features/artifacts/task-agent/remote-steps.server";
import {
  type PresentationEditProposal,
  presentationEditProposalSchema,
} from "../proposal-contract";
import { PRESENTATION_COMPLETION_STANDARD } from "./authoring-input";
import { type PresentationRevisionContent, presentationSourceManifestSchema } from "./contract";
import { PresentationError } from "./errors";
import { readPresentationSourceArchive, runPresentationPipeline } from "./pipeline.server";
import {
  PRESENTATION_REFINEMENT_DBOS_WORKFLOW,
  presentationRefinementStreamKey,
} from "./refine-dbos";
import {
  type PresentationRefinementEvent,
  type PresentationRefinementWorkflowInput,
  presentationRefinementEventSchema,
  presentationRefinementWorkflowInputSchema,
} from "./refine-dbos-contract.server";
import { getPresentationDetailForConversation } from "./service";
import { resolvePresentationSourceForRefinement } from "./source-resolver.server";

type PreparedRefinement = {
  authoringAttemptId: string;
  baseFiles: Array<{ path: string; sha256: string }>;
  conversationId: string;
  deadlineAt: string;
  maxDurationMs: number;
  pollIntervalMs: number;
  workspacePath: string;
};

type CandidateRefinement = {
  changedSlidePaths: string[];
  content: PresentationRevisionContent;
  candidateSourceBundleId: string;
};

function sha256(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function isPresentationSlidePath(filePath: string) {
  return /\.(?:page|slide|ya?ml)$/i.test(filePath);
}

function failureCode(error: unknown) {
  if (error instanceof PresentationError) return error.code;
  const message = error instanceof Error ? error.message : "presentation_refinement_failed";
  return /^[a-z0-9_]{1,100}$/.test(message) ? message : "presentation_refinement_failed";
}

async function findAuthoringSession(input: PresentationRefinementWorkflowInput, db: Database) {
  let revisionId: string | null = input.baseRevisionId;
  const visited = new Set<string>();
  for (let index = 0; revisionId && index < 200 && !visited.has(revisionId); index += 1) {
    visited.add(revisionId);
    const [revision] = await db
      .select({
        generationAttemptId: artifactRevisions.generationAttemptId,
        parentRevisionId: artifactRevisions.parentRevisionId,
      })
      .from(artifactRevisions)
      .where(
        and(
          eq(artifactRevisions.artifactId, input.artifactId),
          eq(artifactRevisions.id, revisionId),
        ),
      )
      .limit(1);
    if (!revision) break;
    if (revision.generationAttemptId) {
      const [attempt] = await db
        .select({ providerConversationId: artifactGenerationAttempts.providerConversationId })
        .from(artifactGenerationAttempts)
        .where(eq(artifactGenerationAttempts.id, revision.generationAttemptId))
        .limit(1);
      if (attempt?.providerConversationId) {
        return {
          attemptId: revision.generationAttemptId,
          conversationId: attempt.providerConversationId,
        };
      }
    }
    revisionId = revision.parentRevisionId;
  }
  throw new Error("authoring_session_unavailable");
}

async function prepareAndMaterialize(
  input: PresentationRefinementWorkflowInput,
  dependencies: {
    clientForAttempt: (attemptId: string) => OpenHandsAuthoringClient;
    db: Database;
    environmentForAttempt: (attemptId: string) => OpenHandsAuthoringEnvironment;
    storage: ArtifactRenderStorage;
  },
): Promise<PreparedRefinement> {
  const detail = await getPresentationDetailForConversation(
    input.actor,
    {
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    },
    dependencies.db,
  );
  if (
    detail.generationState !== "ready" ||
    detail.artifact.currentRevision.id !== input.baseRevisionId
  ) {
    throw new PresentationError("presentation_refinement_stale");
  }
  for (const item of input.focus) {
    if (item.index >= detail.artifact.currentRevision.content.pageCount) {
      throw new PresentationError("presentation_refinement_invalid");
    }
  }

  const lineage = await findAuthoringSession(input, dependencies.db);
  const environment = dependencies.environmentForAttempt(lineage.attemptId);
  const deadlineAt = new Date(Date.now() + environment.maxDurationMs).toISOString();
  const client = dependencies.clientForAttempt(lineage.attemptId);
  await client.getServerInfo({ deadlineAt });
  const source = await resolvePresentationSourceForRefinement(
    input.actor,
    {
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      revisionId: input.baseRevisionId,
      workspaceId: input.workspaceId,
    },
    { db: dependencies.db, storage: dependencies.storage },
  );
  const workspacePath = `${environment.workspaceRoot}/${lineage.attemptId}`;
  if (!client.executeBashCommand) {
    throw new Error("presentation_refinement_workspace_reset_unavailable");
  }
  const outputPath = `${workspacePath}/out`;
  const reset = await client.executeBashCommand({
    command: `rm -rf -- ${shellQuote(outputPath)} && mkdir -p -- ${shellQuote(outputPath)}`,
    cwd: environment.workspaceRoot,
    deadlineAt,
    timeout: 30,
  });
  if (reset.exitCode !== 0) {
    throw new Error("presentation_refinement_workspace_reset_failed");
  }
  for (const file of source.files) {
    await client.uploadFile({
      body: file.body,
      contentType: /\.(?:pptd|ya?ml|page)$/i.test(file.path)
        ? "text/plain"
        : "application/octet-stream",
      deadlineAt,
      path: `${workspacePath}/${file.path}`,
    });
  }
  return {
    authoringAttemptId: lineage.attemptId,
    baseFiles: source.files.map((file) => ({
      path: file.path,
      sha256: sha256(file.body),
    })),
    conversationId: lineage.conversationId,
    deadlineAt,
    maxDurationMs: environment.maxDurationMs,
    pollIntervalMs: environment.pollIntervalMs,
    workspacePath,
  };
}

async function collectAndStage(
  input: PresentationRefinementWorkflowInput,
  prepared: PreparedRefinement,
  dependencies: {
    clientForAttempt: (attemptId: string) => OpenHandsAuthoringClient;
    db: Database;
    storage: ArtifactRenderStorage;
  },
): Promise<CandidateRefinement> {
  const downloaded = await dependencies
    .clientForAttempt(prepared.authoringAttemptId)
    .downloadArchive({
      deadlineAt: prepared.deadlineAt,
      path: `${prepared.workspacePath}/out`,
    });
  const pipeline = await runPresentationPipeline({
    archive: downloaded.archive,
    summary: input.instruction.slice(0, 4_000),
  });
  const candidateFiles = await readPresentationSourceArchive(pipeline.sourceArchive);
  const baseHashes = new Map(prepared.baseFiles.map((file) => [file.path, file.sha256]));
  const candidateHashes = new Map(candidateFiles.map((file) => [file.path, sha256(file.body)]));
  const changedPaths = [...new Set([...baseHashes.keys(), ...candidateHashes.keys()])]
    .filter((filePath) => baseHashes.get(filePath) !== candidateHashes.get(filePath))
    .sort((left, right) => left.localeCompare(right, "en"));
  if (changedPaths.length === 0) throw new Error("presentation_refinement_no_changes");
  const changedSlidePaths = changedPaths.filter(isPresentationSlidePath);
  if (changedSlidePaths.length === 0) {
    changedSlidePaths.push(...input.focus.map((item) => item.path));
  }

  const objectKey = `artifacts/${input.artifactId}/presentation-refinement/${input.runId}/source.tar.gz`;
  const stored = await putImmutableArtifactObject(dependencies.storage, {
    body: pipeline.sourceArchive,
    contentType: "application/gzip",
    key: objectKey,
  });
  const bundle = await stageArtifactSourceBundle(
    {
      artifactId: input.artifactId,
      manifest: presentationSourceManifestSchema.parse(pipeline.sourceManifest),
      mediaType: "application/gzip",
      objectKey,
      objectVersionId: stored.versionId,
      producingRunId: input.runId,
      recipeVersion: "presentation-pptd-v1",
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
    },
    dependencies.db,
  );
  return {
    changedSlidePaths,
    content: pipeline.content,
    candidateSourceBundleId: bundle.id,
  };
}

async function publishProposal(
  input: PresentationRefinementWorkflowInput,
  candidate: CandidateRefinement,
  db: Database,
): Promise<PresentationEditProposal> {
  const proposal = presentationEditProposalSchema.parse({
    artifactId: input.artifactId,
    baseRevisionId: input.baseRevisionId,
    candidateSourceBundleId: candidate.candidateSourceBundleId,
    changedSlidePaths: candidate.changedSlidePaths,
    focus: input.focus,
    kind: "presentation",
    request: input.instruction,
    runId: input.runId,
    summary: candidate.content.summary,
    title: candidate.content.title,
  });
  await publishArtifactEditProposal(
    input.actor,
    {
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      groundingReceipt: { operationEvidence: [], version: 1 },
      proposal,
      workspaceId: input.workspaceId,
    },
    db,
  );
  return proposal;
}

export function refinementInstruction(input: PresentationRefinementWorkflowInput) {
  const focus = input.focus.map((item) => `slide ${item.index + 1} (${item.path})`).join(", ");
  return [
    "Continue the existing presentation authoring session in the current workspace.",
    "Refine the editable PPTD project in place, and do not create a new conversation or a new project.",
    `Focus only on these slides: ${focus}.`,
    "Preserve all unrelated slides and assets. Make the requested change, then validate only hard correctness; do not spend an unbounded repair loop on visual polish.",
    PRESENTATION_COMPLETION_STANDARD,
    "Once the requested change is written and the project is structurally valid, call FinishTool. Warning-only findings are acceptable.",
    `User request: ${input.instruction}`,
  ].join("\n\n");
}

export function registerPresentationRefinementDbosWorkflow(input: {
  client?: OpenHandsAuthoringClient;
  db: Database;
  environment?: OpenHandsAuthoringEnvironment;
  pool: Pool;
  storage?: ArtifactRenderStorage;
}) {
  const environmentForAttempt = (attemptId: string) =>
    input.environment ??
    openHandsAuthoringEnvironment(undefined, "presentation-pptd-v1", attemptId);
  const clientForAttempt = (attemptId: string) =>
    input.client ?? createOpenHandsAuthoringClient(environmentForAttempt(attemptId));
  const storage = input.storage ?? createArtifactRenderStorage();
  const remote = registerTaskAgentRemoteSteps({
    clientForAttempt,
    name: "Presentation",
    stepNamePrefix: "Refinement",
  });
  const prepare = DBOS.registerStep(
    (rawInput: PresentationRefinementWorkflowInput) =>
      prepareAndMaterialize(rawInput, {
        clientForAttempt,
        db: input.db,
        environmentForAttempt,
        storage,
      }),
    { name: "preparePresentationRefinementWorkspace", retriesAllowed: true, maxAttempts: 3 },
  );
  const collect = DBOS.registerStep(
    (rawInput: PresentationRefinementWorkflowInput, prepared: PreparedRefinement) =>
      collectAndStage(rawInput, prepared, { clientForAttempt, db: input.db, storage }),
    {
      name: "collectAndValidatePresentationRefinementCandidate",
      retriesAllowed: true,
      maxAttempts: 3,
    },
  );
  const publish = DBOS.registerStep(
    (rawInput: PresentationRefinementWorkflowInput, candidate: CandidateRefinement) =>
      publishProposal(rawInput, candidate, input.db),
    { name: "publishPresentationRefinementProposal", retriesAllowed: true, maxAttempts: 3 },
  );

  async function workflow(rawInput: PresentationRefinementWorkflowInput) {
    const workflowInput = presentationRefinementWorkflowInputSchema.parse(rawInput);
    if (DBOS.workflowID && DBOS.workflowID !== workflowInput.runId) {
      throw new Error("presentation_refinement_workflow_id_mismatch");
    }
    const streamKey = presentationRefinementStreamKey(workflowInput.runId);
    const writeEvent = (event: PresentationRefinementEvent) =>
      DBOS.writeStream(streamKey, JSON.stringify(presentationRefinementEventSchema.parse(event)));
    try {
      const prepared = await prepare(workflowInput);
      await writeEvent({
        baseRevisionId: workflowInput.baseRevisionId,
        runId: workflowInput.runId,
        type: "prepared",
      });
      await writeEvent({
        conversationId: prepared.conversationId,
        runId: workflowInput.runId,
        type: "authoring_started",
      });
      await remote.continueConversation(
        prepared.authoringAttemptId,
        prepared.conversationId,
        prepared.deadlineAt,
        refinementInstruction(workflowInput),
        `presentation-refine:${workflowInput.runId}`,
      );
      const environment = environmentForAttempt(prepared.authoringAttemptId);
      await remote.wait({
        attemptId: prepared.authoringAttemptId,
        conversationId: prepared.conversationId,
        deadlineAt: prepared.deadlineAt,
        maxDurationMs: Math.min(
          prepared.maxDurationMs,
          Math.max(1, Date.parse(prepared.deadlineAt) - Date.now()),
        ),
        pollIntervalMs: environment.pollIntervalMs,
      });
      const candidate = await collect(workflowInput, prepared);
      await writeEvent({
        changedSlidePaths: candidate.changedSlidePaths,
        runId: workflowInput.runId,
        type: "candidate_validated",
      });
      const proposal = await publish(workflowInput, candidate);
      await writeEvent({ proposal, runId: workflowInput.runId, type: "proposal_published" });
      return proposal;
    } catch (error) {
      await writeEvent({
        failureCode: failureCode(error),
        runId: workflowInput.runId,
        type: "failed",
      });
      throw error;
    } finally {
      await DBOS.closeStream(streamKey);
    }
  }

  return DBOS.registerWorkflow(workflow, {
    inputSchema: z.tuple([presentationRefinementWorkflowInputSchema]),
    maxRecoveryAttempts: 100,
    name: PRESENTATION_REFINEMENT_DBOS_WORKFLOW,
    serialization: "portable",
  });
}
