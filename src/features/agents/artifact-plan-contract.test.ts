import { describe, expect, test } from "vitest";
import { commitArtifactPlanToolInputSchema } from "./artifact-plan-contract";

function item(index: number) {
  return {
    goal: `Explain topic ${index}`,
    groundingRefs: [],
    kind: "teaching_document" as const,
    requirements: [],
    title: `Document ${index}`,
  };
}

describe("commitArtifactPlanToolInputSchema", () => {
  test("accepts more than four plan items", () => {
    expect(
      commitArtifactPlanToolInputSchema.safeParse({
        items: Array.from({ length: 12 }, (_, i) => item(i)),
      }).success,
    ).toBe(true);
  });

  test("accepts the same Artifact kind more than once", () => {
    expect(
      commitArtifactPlanToolInputSchema
        .parse({
          items: [item(0), item(1)],
        })
        .items.map((candidate) => candidate.kind),
    ).toEqual(["teaching_document", "teaching_document"]);
  });

  test("ignores harmless extra fields from the model", () => {
    const parsed = commitArtifactPlanToolInputSchema.parse({
      items: [{ ...item(0), description: "A redundant model-generated description" }],
    });

    expect(parsed.items[0]).toEqual(item(0));
    expect(parsed.items[0]).not.toHaveProperty("description");
  });
});
