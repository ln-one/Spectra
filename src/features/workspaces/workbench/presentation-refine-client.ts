"use client";

import { z } from "zod";
import type { PresentationEditProposal } from "@/features/artifacts/proposal-contract";

const sourceSchema = z
  .object({
    pageMap: z.record(z.string(), z.string()),
    pptdContent: z.string().min(1),
  })
  .strict();
const proposalResponseSchema = z.object({ acceptedRevisionId: z.string().uuid() }).passthrough();

function query(input: {
  conversationId: string;
  expectedRevisionId?: string;
  workspaceId: string;
}) {
  const params = new URLSearchParams({
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  });
  if (input.expectedRevisionId) params.set("expectedRevisionId", input.expectedRevisionId);
  return params;
}

export async function fetchPresentationProposalSource(input: {
  artifactId: string;
  conversationId: string;
  expectedRevisionId: string;
  runId: string;
  workspaceId: string;
}) {
  const response = await fetch(
    `/api/artifacts/presentation/${input.artifactId}/proposals/${input.runId}/source?${query(input)}`,
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) throw new Error("presentation_refinement_source_failed");
  return sourceSchema.parse(await response.json());
}

export async function resolvePresentationProposalAssets(input: {
  artifactId: string;
  conversationId: string;
  expectedRevisionId: string;
  paths: string[];
  runId: string;
  workspaceId: string;
}) {
  const response = await fetch(
    `/api/artifacts/presentation/${input.artifactId}/proposals/${input.runId}/assets?${query(input)}`,
    {
      body: JSON.stringify({ paths: input.paths }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("presentation_refinement_assets_failed");
  const payload: unknown = await response.json();
  return z.object({ assets: z.array(z.string().nullable().optional()) }).parse(payload).assets;
}

export async function acceptPresentationProposal(input: {
  artifactId: string;
  conversationId: string;
  expectedRevisionId: string;
  proposal: PresentationEditProposal;
  workspaceId: string;
}) {
  const response = await fetch(
    `/api/artifacts/presentation/${input.artifactId}/proposals/${input.proposal.runId}?${query({
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    })}`,
    {
      body: JSON.stringify({ expectedRevisionId: input.expectedRevisionId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("presentation_refinement_accept_failed");
  return proposalResponseSchema.parse(await response.json());
}
