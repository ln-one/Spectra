import { expect, test } from "vitest";
import {
  createArtifactsToolInputSchemaFor,
  createArtifactsToolOutputSchema,
} from "./artifact-create-tool-contract";

const request = {
  briefContext: "latest",
  requests: [
    {
      brief: {
        objective: "Teach Newton's second law",
        requirements: ["Use six slides"],
        sections: ["Concept", "Example", "Practice"],
        slideCount: 6,
        subject: "Newton's second law",
      },
      groundingRefs: ["E1"],
      kind: "presentation",
      title: "Newton's Second Law",
    },
  ],
};

test("exposes Presentation creation only when OpenHands execution is enabled", () => {
  expect(createArtifactsToolInputSchemaFor(new Set()).safeParse(request).success).toBe(false);
  expect(createArtifactsToolInputSchemaFor(new Set(["presentation"])).parse(request)).toMatchObject(
    {
      requests: [{ kind: "presentation" }],
    },
  );
});

test("accepts Presentation in the generic Artifact result contract", () => {
  expect(
    createArtifactsToolOutputSchema.parse({
      artifacts: [
        {
          artifactId: "00000000-0000-4000-8000-000000000101",
          generationState: "queued",
          kind: "presentation",
          title: "Newton's Second Law",
        },
      ],
      failedKinds: [],
      status: "complete",
    }),
  ).toMatchObject({ artifacts: [{ kind: "presentation" }] });
});
