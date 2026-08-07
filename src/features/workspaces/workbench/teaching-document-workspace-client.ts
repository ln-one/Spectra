import { z } from "zod";
import type { TeachingDocumentRevisionContent } from "@/features/artifacts/documents/contract";
import {
  type TeachingDocumentArtifact,
  teachingDocumentArtifactSchema,
} from "@/features/artifacts/documents/types";

const artifactResponseSchema = z.object({ artifact: teachingDocumentArtifactSchema }).strict();
const proposalResponseSchema = z
  .object({ acceptedRevisionId: z.string().uuid(), artifact: teachingDocumentArtifactSchema })
  .strict();
const renderResponseSchema = z
  .object({
    downloadUrl: z.string().startsWith("/").nullable(),
    job: z.object({ state: z.enum(["queued", "rendering", "ready", "failed", "cancelled"]) }),
  })
  .passthrough();

function workspaceQuery(conversationId: string, workspaceId: string) {
  return new URLSearchParams({ conversationId, workspaceId });
}

export async function acceptTeachingDocumentProposal(input: {
  artifactId: string;
  conversationId: string;
  expectedRevisionId: string;
  runId: string;
  workspaceId: string;
}) {
  const query = workspaceQuery(input.conversationId, input.workspaceId);
  const response = await fetch(
    `/api/artifacts/teaching-document/${input.artifactId}/proposals/${input.runId}?${query}`,
    {
      body: JSON.stringify({ expectedRevisionId: input.expectedRevisionId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (response.status === 409) return { status: "conflict" as const };
  if (!response.ok) throw new Error("proposal_accept_failed");
  return { status: "accepted" as const, ...proposalResponseSchema.parse(await response.json()) };
}

export async function saveTeachingDocumentRevision(input: {
  artifact: TeachingDocumentArtifact;
  content: TeachingDocumentRevisionContent;
  conversationId: string;
  workspaceId: string;
}) {
  const query = workspaceQuery(input.conversationId, input.workspaceId);
  const response = await fetch(`/api/artifacts/teaching-document/${input.artifact.id}?${query}`, {
    body: JSON.stringify({
      content: input.content,
      expectedRevisionId: input.artifact.currentRevision.id,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error("teaching_document_save_failed");
  return artifactResponseSchema.parse(await response.json()).artifact;
}

function waitForExportPoll(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Export polling aborted", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function prepareTeachingDocumentExport(input: {
  artifactId: string;
  revisionId: string;
  signal: AbortSignal;
}) {
  const endpoint = `/api/artifacts/teaching-document/${input.artifactId}/export?revisionId=${input.revisionId}`;
  let response = await fetch(endpoint, { method: "POST", signal: input.signal });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!response.ok && response.status !== 202) throw new Error("render_failed");
    const payload = renderResponseSchema.parse(await response.json());
    if (payload.job.state === "failed" || payload.job.state === "cancelled") {
      throw new Error("render_failed");
    }
    if (payload.downloadUrl) return payload.downloadUrl;
    const delay = Math.min(2_500, 1_000 + attempt * 100);
    await waitForExportPoll(delay, input.signal);
    response = await fetch(endpoint, { method: "GET", signal: input.signal });
  }
  throw new Error("render_timed_out");
}
