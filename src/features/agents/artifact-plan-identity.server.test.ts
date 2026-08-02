import { describe, expect, test } from "vitest";
import { artifactPlanItemId, artifactPlanWorkflowId } from "./artifact-plan-identity.server";

const scope = {
  conversationId: "9924e340-a561-40d8-94de-86cfcda40ecb",
  sourceUserMessageId: "user:stable-plan",
  workspaceId: "56a7adf8-9254-4b0f-bd50-2a462470af02",
};
const item = {
  goal: "Explain a stable topic",
  groundingRefs: [],
  kind: "teaching_document" as const,
  requirements: [],
  title: "Stable document",
};

describe("Artifact plan identities", () => {
  test("replays the same request with the same workflow and item IDs", () => {
    expect(artifactPlanWorkflowId(scope)).toBe(artifactPlanWorkflowId({ ...scope }));
    expect(
      artifactPlanItemId({ index: 0, item, sourceUserMessageId: scope.sourceUserMessageId }),
    ).toBe(
      artifactPlanItemId({
        index: 0,
        item: { ...item },
        sourceUserMessageId: scope.sourceUserMessageId,
      }),
    );
  });

  test("keeps identical items at different positions distinct", () => {
    expect(
      artifactPlanItemId({ index: 0, item, sourceUserMessageId: scope.sourceUserMessageId }),
    ).not.toBe(
      artifactPlanItemId({ index: 1, item, sourceUserMessageId: scope.sourceUserMessageId }),
    );
  });
});
