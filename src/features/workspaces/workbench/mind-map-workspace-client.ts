import { z } from "zod";
import type { MindMapContent } from "@/features/artifacts/mind-maps/contract";
import { type MindMapArtifact, mindMapArtifactSchema } from "@/features/artifacts/mind-maps/types";

const artifactResponseSchema = z.object({ artifact: mindMapArtifactSchema }).strict();
const proposalResponseSchema = z
  .object({ acceptedRevisionId: z.string().uuid(), artifact: mindMapArtifactSchema })
  .strict();

export async function acceptMindMapProposal(input: {
  artifactId: string;
  conversationId: string;
  expectedRevisionId: string;
  runId: string;
  workspaceId: string;
}) {
  const query = new URLSearchParams({
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  });
  const response = await fetch(
    `/api/artifacts/mind-map/${input.artifactId}/proposals/${input.runId}?${query}`,
    {
      body: JSON.stringify({ expectedRevisionId: input.expectedRevisionId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  if (response.status === 409) return { status: "conflict" as const };
  if (!response.ok) throw new Error("mind_map_proposal_accept_failed");
  return { ...proposalResponseSchema.parse(await response.json()), status: "accepted" as const };
}

export async function saveMindMapRevision(input: {
  artifact: MindMapArtifact;
  content: MindMapContent;
  conversationId: string;
  expectedRevisionId: string;
  workspaceId: string;
}) {
  const query = new URLSearchParams({
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  });
  const response = await fetch(`/api/artifacts/mind-map/${input.artifact.id}?${query}`, {
    body: JSON.stringify({
      content: input.content,
      expectedRevisionId: input.expectedRevisionId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (response.status === 409) return { status: "conflict" as const };
  if (!response.ok) throw new Error("mind_map_save_failed");
  return {
    artifact: artifactResponseSchema.parse(await response.json()).artifact,
    status: "saved" as const,
  };
}
