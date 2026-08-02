import { z } from "zod";
import type { ArtifactSource } from "@/features/sources/types";
import { sortArtifactHistory } from "./artifact-history";
import {
  type ArtifactDetail,
  artifactDetailSchema,
  artifactHistoryItemFromDetail,
} from "./contract";
import { type ArtifactEditProposal, artifactEditProposalSchema } from "./proposal-contract";
import {
  type ArtifactHistoryItem,
  artifactEffectiveGenerationState,
  artifactGenerationStateRank,
  artifactGenerationStateSchema,
  artifactHistoryItemSchema,
  artifactSourceKindSchema,
} from "./types";

const historyResponseSchema = z.object({ artifacts: z.unknown() }).strict();
const detailResponseSchema = z.object({ detail: z.unknown() }).strict();
const artifactSourceMembershipResponseSchema = z
  .object({
    source: z
      .object({
        id: z.string().uuid(),
        workspaceId: z.string().uuid(),
        kind: z.literal("artifact"),
        artifact: z
          .object({
            id: z.string().uuid(),
            kind: artifactSourceKindSchema,
            title: z.string().trim().min(1).max(200),
            conversationId: z.string().uuid(),
            generationState: artifactGenerationStateSchema,
            createdAt: z.iso.datetime(),
            updatedAt: z.iso.datetime(),
            currentRevision: z
              .object({
                id: z.string().uuid(),
                revisionNumber: z.number().int().positive(),
              })
              .strict(),
          })
          .strict(),
        knowledgeIndex: z
          .object({
            state: z.enum(["queued", "projecting", "publishing", "ready", "failed", "obsolete"]),
            chunkCount: z.number().int().nonnegative(),
            failureCode: z.string().nullable(),
            retryCount: z.number().int().nonnegative(),
            nextRetryAt: z.iso.datetime().nullable(),
            updatedAt: z.iso.datetime(),
          })
          .strict()
          .optional(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      })
      .strict(),
  })
  .strict();
const proposalResponseSchema = z
  .object({ proposal: artifactEditProposalSchema.nullable() })
  .strict();

export const artifactWorkbenchQueryKeys = {
  detail: (workspaceId: string, conversationId: string, artifactId: string) =>
    ["workspace", workspaceId, "conversation", conversationId, "artifact", artifactId] as const,
  history: (workspaceId: string, conversationId: string) =>
    ["workspace", workspaceId, "conversation", conversationId, "artifacts"] as const,
  proposal: (workspaceId: string, conversationId: string, artifactId: string) =>
    [
      "workspace",
      workspaceId,
      "conversation",
      conversationId,
      "artifact",
      artifactId,
      "proposal",
    ] as const,
};

export class ArtifactDetailError extends Error {
  constructor(readonly code: "not_found" | "unavailable") {
    super(`artifact_detail_${code}`);
  }
}

export async function fetchArtifactHistory(workspaceId: string, conversationId: string) {
  const query = new URLSearchParams({ conversationId, workspaceId });
  const response = await fetch(`/api/artifacts?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error("artifact_history_unavailable");
  const payload = historyResponseSchema.parse(await response.json());
  return sortArtifactHistory(z.array(artifactHistoryItemSchema).parse(payload.artifacts));
}

export async function fetchArtifactDetail(input: {
  artifactId: string;
  conversationId: string;
  workspaceId: string;
}) {
  const query = new URLSearchParams({
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  });
  const response = await fetch(`/api/artifacts/${input.artifactId}?${query}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new ArtifactDetailError(response.status === 404 ? "not_found" : "unavailable");
  }
  const payload = detailResponseSchema.parse(await response.json());
  return artifactDetailSchema.parse(payload.detail);
}

export async function deleteArtifact(input: {
  artifactId: string;
  conversationId: string;
  workspaceId: string;
}) {
  const query = new URLSearchParams({
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  });
  const response = await fetch(`/api/artifacts/${input.artifactId}?${query}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("artifact_delete_failed");
}

export async function addArtifactToSources(input: {
  artifactId: string;
  conversationId: string;
  workspaceId: string;
}): Promise<ArtifactSource> {
  const query = new URLSearchParams({
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  });
  const response = await fetch(`/api/artifacts/${input.artifactId}/source?${query}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("artifact_source_add_failed");
  const { knowledgeIndex, ...source } = artifactSourceMembershipResponseSchema.parse(
    await response.json(),
  ).source;
  return {
    ...source,
    ...(knowledgeIndex ? { knowledgeIndex } : {}),
  };
}

export async function fetchCurrentArtifactProposal(input: {
  artifactId: string;
  conversationId: string;
  workspaceId: string;
}): Promise<ArtifactEditProposal | null> {
  const query = new URLSearchParams({
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  });
  const response = await fetch(`/api/artifacts/${input.artifactId}/proposal?${query}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("artifact_proposal_unavailable");
  return proposalResponseSchema.parse(await response.json()).proposal;
}

export async function dismissArtifactProposal(input: {
  artifactId: string;
  conversationId: string;
  runId: string;
  workspaceId: string;
}) {
  const query = new URLSearchParams({
    conversationId: input.conversationId,
    runId: input.runId,
    workspaceId: input.workspaceId,
  });
  const response = await fetch(`/api/artifacts/${input.artifactId}/proposal?${query}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("artifact_proposal_dismiss_failed");
}

export function upsertArtifactHistory(
  history: readonly ArtifactHistoryItem[],
  detail: ArtifactDetail,
  options: { insertIfMissing?: boolean } = {},
) {
  const candidate = artifactHistoryItemFromDetail(detail);
  const current = history.find((item) => item.id === detail.id);
  if (!current && options.insertIfMissing === false) return sortArtifactHistory(history);
  if (current) {
    if (current.currentRevisionId && !candidate.currentRevisionId)
      return sortArtifactHistory(history);
    const currentUpdatedAt = Date.parse(current.updatedAt);
    const candidateUpdatedAt = Date.parse(candidate.updatedAt);
    if (currentUpdatedAt > candidateUpdatedAt) return sortArtifactHistory(history);
    if (
      currentUpdatedAt === candidateUpdatedAt &&
      artifactGenerationStateRank(artifactEffectiveGenerationState(current)) >
        artifactGenerationStateRank(artifactEffectiveGenerationState(candidate))
    ) {
      return sortArtifactHistory(history);
    }
  }
  return sortArtifactHistory([candidate, ...history.filter((item) => item.id !== detail.id)]).slice(
    0,
    50,
  );
}

export function artifactHasRenderableContent(detail: ArtifactDetail | undefined) {
  if (!detail) return false;
  switch (detail.kind) {
    case "teaching_document":
    case "mind_map":
      return detail.artifact !== null || detail.draft !== null;
    case "quiz":
    case "game":
    case "presentation":
    case "animation":
      return detail.artifact !== null;
  }
}

export type ArtifactStreamEvent = {
  detail: ArtifactDetail;
  replayedFromHistory?: boolean;
  sourceUserMessageId?: string;
  type: "started";
};

export function parseArtifactStreamEvent(part: {
  data?: unknown;
  name?: string;
  type: string;
}): ArtifactStreamEvent | null {
  if (
    part.type !== "data-artifactStarted" &&
    !(part.type === "data" && part.name === "artifactStarted")
  )
    return null;
  const detail = artifactDetailSchema.safeParse(part.data);
  return detail.success ? { detail: detail.data, type: "started" } : null;
}
