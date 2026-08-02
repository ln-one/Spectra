import { describe, expect, test, vi } from "vitest";
import type { TeachingDocumentDetail } from "@/features/artifacts/documents/types";
import type {
  ArtifactPlanEvent,
  ArtifactPlanWorkflowInput,
} from "./artifact-plan-dbos-contract.server";
import {
  ARTIFACT_PLAN_STEP_CONFIG,
  executeArtifactPlanWorkflow,
} from "./artifact-plan-dbos-worker.server";

const workflowId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "56a7adf8-9254-4b0f-bd50-2a462470af02";

function workflowInput(): ArtifactPlanWorkflowInput {
  return {
    actor: { handle: "alice", principalId: "principal-alice" },
    conversationId: "9924e340-a561-40d8-94de-86cfcda40ecb",
    items: Array.from({ length: 3 }, (_, index) => ({
      grounding: { evidence: [], version: 1 },
      kind: "teaching_document" as const,
      planItemId: `00000000-0000-4000-8000-00000000001${index}`,
      prompt: `Create document ${index}`,
      title: `Document ${index}`,
    })),
    locale: "en-US",
    rootRunId: "20000000-0000-4000-8000-000000000001",
    sourceUserMessageId: "user:dbos-plan",
    workflowId,
    workspaceId,
  };
}

function queuedDetail(index: number): TeachingDocumentDetail {
  return {
    artifact: null,
    createdAt: "2026-07-30T00:00:00.000Z",
    draft: null,
    failureCode: null,
    generationAttemptId: null,
    generationSequence: 0,
    generationState: "queued",
    id: `30000000-0000-4000-8000-00000000001${index}`,
    kind: "teaching_document",
    title: `Document ${index}`,
    updatedAt: "2026-07-30T00:00:00.000Z",
    workspaceId,
  };
}

describe("Artifact plan DBOS workflow", () => {
  test("configures exactly one retry after the initial item attempt", () => {
    expect(ARTIFACT_PLAN_STEP_CONFIG).toMatchObject({
      maxAttempts: 2,
      retriesAllowed: true,
    });
  });

  test("starts items strictly in order and continues after one terminal item failure", async () => {
    const events: ArtifactPlanEvent[] = [];
    const calls: string[] = [];
    const closeStream = vi.fn(async () => undefined);
    const result = await executeArtifactPlanWorkflow(workflowInput(), {
      closeStream,
      startItem: vi.fn(async (_input, item) => {
        calls.push(item.planItemId);
        if (item.title === "Document 1") throw new Error("provider unavailable");
        return queuedDetail(Number(item.title.at(-1)));
      }),
      writeEvent: vi.fn(async (_key, event) => {
        events.push(event);
      }),
    });

    expect(calls).toEqual(workflowInput().items.map((item) => item.planItemId));
    expect(result.results.map((item) => item.status)).toEqual(["started", "failed", "started"]);
    expect(events.map((event) => event.type)).toEqual([
      "item-running",
      "item-started",
      "item-running",
      "item-failed",
      "item-running",
      "item-started",
      "completed",
    ]);
    expect(closeStream).toHaveBeenCalledOnce();
  });
});
