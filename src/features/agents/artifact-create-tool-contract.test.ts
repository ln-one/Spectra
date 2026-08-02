import { describe, expect, it } from "vitest";
import { createArtifactsToolInputSchema } from "./artifact-create-tool-contract";

describe("createArtifactsToolInputSchema", () => {
  it("accepts an artifact request without extra requirements", () => {
    const input = createArtifactsToolInputSchema.parse({
      requests: [
        {
          brief: {
            branches: ["Foundations", "Methods"],
            objective: "Build a learning path",
            subject: "Human-computer interaction",
          },
          groundingRefs: [],
          kind: "mind_map",
          title: "HCI learning path",
        },
      ],
    });

    expect(input.requests[0]?.brief.requirements).toBeUndefined();
  });

  it("accepts a concise description on a game request", () => {
    const input = createArtifactsToolInputSchema.parse({
      requests: [
        {
          brief: {
            objective: "Review decision-tree concepts through a game",
            questionPlan: {
              questionCount: 12,
              singleChoice: 8,
              trueFalse: 4,
            },
            skin: "skyline_day",
            subject: "Decision trees",
          },
          description: "A decision-tree review game",
          groundingRefs: [],
          kind: "game",
          title: "Decision Tree Adventure",
        },
      ],
    });

    expect(input.requests[0]?.description).toBe("A decision-tree review game");
  });

  it("does not cap the total Game question count", () => {
    const input = createArtifactsToolInputSchema.parse({
      requests: [
        {
          brief: {
            objective: "Practice a large subject through a game",
            questionPlan: { questionCount: 31, singleChoice: 20, trueFalse: 11 },
            skin: "skyline_day",
            subject: "Large subject",
          },
          groundingRefs: [],
          kind: "game",
          title: "Large question game",
        },
      ],
    });

    const request = input.requests[0];
    expect(request?.kind).toBe("game");
    if (request?.kind !== "game") throw new Error("Expected a Game request");
    expect(request.brief.questionPlan.questionCount).toBe(31);
  });
});
