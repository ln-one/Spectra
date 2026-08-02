import { z } from "zod";
import type { ArtifactCreationCapabilities } from "@/features/artifacts/task-agent/creation-capabilities";
import { artifactGenerationStateSchema } from "@/features/artifacts/types";
import type { ArtifactPlanItem } from "./artifact-plan-contract";
import { artifactGroundingRefsSchema } from "./artifact-tool-protocol";

const artifactCreationBriefBase = {
  audience: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .nullable()
    .optional()
    .describe("Intended audience for this Artifact only, when the user specified one."),
  objective: z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .describe("What this specific Artifact should help the user accomplish."),
  requirements: z
    .array(z.string().trim().min(1).max(1_000))
    .max(20)
    .optional()
    .describe("Only constraints that apply to this specific Artifact; omit or use [] when none."),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("Resolved subject of this specific Artifact, without creation commands."),
};

const artifactCreationDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .optional()
  .describe("Optional concise description of the Artifact.");

const teachingDocumentCreationRequestSchema = z
  .object({
    brief: z
      .object({
        ...artifactCreationBriefBase,
        sections: z
          .array(z.string().trim().min(1).max(500))
          .max(30)
          .describe("Requested document sections in order; use [] when not specified."),
      })
      .strict(),
    description: artifactCreationDescriptionSchema,
    kind: z.literal("teaching_document"),
    title: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("Concise initial title for this teaching document."),
  })
  .strict();

const mindMapCreationRequestSchema = z
  .object({
    brief: z
      .object({
        ...artifactCreationBriefBase,
        branches: z
          .array(z.string().trim().min(1).max(500))
          .max(30)
          .describe("Requested top-level map branches; use [] when not specified."),
      })
      .strict(),
    description: artifactCreationDescriptionSchema,
    kind: z.literal("mind_map"),
    title: z.string().trim().min(1).max(200).describe("Concise initial title for this mind map."),
  })
  .strict();

const quizQuestionPlanSchema = z
  .object({
    multipleChoice: z
      .number()
      .int()
      .min(0)
      .max(50)
      .describe("Number of multiple-choice questions."),
    questionCount: z.number().int().min(1).max(50).describe("Exact total question count."),
    singleChoice: z.number().int().min(0).max(50).describe("Number of single-choice questions."),
    trueFalse: z.number().int().min(0).max(50).describe("Number of true/false questions."),
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.singleChoice + plan.multipleChoice + plan.trueFalse !== plan.questionCount) {
      context.addIssue({
        code: "custom",
        message: "Quiz question type counts must sum to questionCount",
      });
    }
  });

const quizCreationRequestSchema = z
  .object({
    brief: z
      .object({
        ...artifactCreationBriefBase,
        questionPlan: quizQuestionPlanSchema,
      })
      .strict(),
    description: artifactCreationDescriptionSchema,
    kind: z.literal("quiz"),
    title: z.string().trim().min(1).max(200).describe("Concise initial title for this quiz."),
  })
  .strict();

const gameCreationRequestSchema = z
  .object({
    brief: z
      .object({
        ...artifactCreationBriefBase,
        questionPlan: z
          .object({
            questionCount: z.number().int().min(6),
            singleChoice: z.number().int().min(0),
            trueFalse: z.number().int().min(0),
          })
          .strict()
          .superRefine((plan, context) => {
            if (plan.singleChoice + plan.trueFalse !== plan.questionCount) {
              context.addIssue({
                code: "custom",
                message: "Game question counts must sum to questionCount",
              });
            }
          }),
        skin: z.enum(["skyline_day", "city_sunset", "city_night"]),
      })
      .strict(),
    description: artifactCreationDescriptionSchema,
    kind: z.literal("game"),
    title: z.string().trim().min(1).max(200).describe("Concise initial title for this game."),
  })
  .strict();

const presentationCreationRequestSchema = z
  .object({
    brief: z
      .object({
        ...artifactCreationBriefBase,
        sections: z
          .array(z.string().trim().min(1).max(500))
          .max(40)
          .describe("Requested slide sections in order; use [] when not specified."),
        slideCount: z
          .number()
          .int()
          .min(1)
          .max(100)
          .nullable()
          .describe("Exact slide count only when the user specified one; otherwise null."),
      })
      .strict(),
    description: artifactCreationDescriptionSchema,
    kind: z.literal("presentation"),
    title: z.string().trim().min(1).max(200).describe("Concise initial Presentation title."),
  })
  .strict();

const animationCreationRequestSchema = z
  .object({
    brief: z
      .object({
        ...artifactCreationBriefBase,
        durationSeconds: z
          .number()
          .int()
          .min(15)
          .max(60)
          .nullable()
          .describe(
            "Exact duration only when specified; otherwise null for the 30-second default.",
          ),
        scenes: z
          .array(z.string().trim().min(1).max(500))
          .max(8)
          .describe("Requested scenes in order; use [] when not specified."),
      })
      .strict(),
    description: artifactCreationDescriptionSchema,
    kind: z.literal("animation"),
    title: z.string().trim().min(1).max(200).describe("Concise knowledge-animation title."),
  })
  .strict();

const baseCreationRequestSchemas = [
  teachingDocumentCreationRequestSchema,
  mindMapCreationRequestSchema,
  quizCreationRequestSchema,
  gameCreationRequestSchema,
] as const;

const artifactCreationPlanRequestSchema = z.discriminatedUnion("kind", [
  ...baseCreationRequestSchemas,
  presentationCreationRequestSchema,
  animationCreationRequestSchema,
]);

const MAX_ARTIFACT_CREATIONS_PER_TURN = 8;

const baseArtifactCreationRequestSchemas = [
  teachingDocumentCreationRequestSchema.extend({
    groundingRefs: artifactGroundingRefsSchema,
  }),
  mindMapCreationRequestSchema.extend({
    groundingRefs: artifactGroundingRefsSchema,
  }),
  quizCreationRequestSchema.extend({
    groundingRefs: artifactGroundingRefsSchema,
  }),
  gameCreationRequestSchema.extend({
    groundingRefs: artifactGroundingRefsSchema,
  }),
] as const;

const presentationCreationRequestWithGroundingSchema = presentationCreationRequestSchema.extend({
  groundingRefs: artifactGroundingRefsSchema,
});
const animationCreationRequestWithGroundingSchema = animationCreationRequestSchema.extend({
  groundingRefs: artifactGroundingRefsSchema,
});

const artifactCreationRequestSchema = z.discriminatedUnion("kind", [
  ...baseArtifactCreationRequestSchemas,
  presentationCreationRequestWithGroundingSchema,
  animationCreationRequestWithGroundingSchema,
]);

function artifactCreationInputSchema(capabilities: ArtifactCreationCapabilities) {
  const requestSchema: z.ZodType<ArtifactCreationRequest> =
    capabilities.has("presentation") && capabilities.has("animation")
      ? artifactCreationRequestSchema
      : capabilities.has("presentation")
        ? z.discriminatedUnion("kind", [
            ...baseArtifactCreationRequestSchemas,
            presentationCreationRequestWithGroundingSchema,
          ])
        : capabilities.has("animation")
          ? z.discriminatedUnion("kind", [
              ...baseArtifactCreationRequestSchemas,
              animationCreationRequestWithGroundingSchema,
            ])
          : z.discriminatedUnion("kind", baseArtifactCreationRequestSchemas);
  return z
    .object({
      briefContext: z
        .enum(["latest", "continue_previous_artifact_request"])
        .default("latest")
        .describe(
          "Use latest unless the current message explicitly continues the previous successful Artifact request.",
        ),
      requests: z
        .array(requestSchema)
        .min(1)
        .max(MAX_ARTIFACT_CREATIONS_PER_TURN)
        .describe(
          "One independently planned request per explicitly requested Artifact kind. The safety cap is eight kinds per turn.",
        ),
    })
    .strict()
    .superRefine((value, context) => {
      const kinds = value.requests.map((request) => request.kind);
      if (new Set(kinds).size !== kinds.length) {
        context.addIssue({
          code: "custom",
          message: "Artifact creation requests must use unique kinds",
          path: ["requests"],
        });
      }
    });
}

export const createArtifactsToolInputSchema = artifactCreationInputSchema(
  new Set(["presentation", "animation"]),
);

export function createArtifactsToolInputSchemaFor(capabilities: ArtifactCreationCapabilities) {
  return artifactCreationInputSchema(capabilities);
}

export const previousArtifactCreationPlanSchema = z
  .object({
    requests: z
      .array(artifactCreationPlanRequestSchema)
      .min(1)
      .max(MAX_ARTIFACT_CREATIONS_PER_TURN),
  })
  .strict();

export type ArtifactCreationRequest = z.infer<typeof artifactCreationRequestSchema>;
export type PreviousArtifactCreationPlan = z.infer<typeof previousArtifactCreationPlanSchema>;

export function previousArtifactCreationPlanFromRequests(
  requests: readonly ArtifactCreationRequest[],
): PreviousArtifactCreationPlan {
  return previousArtifactCreationPlanSchema.parse({
    requests: requests.map(({ groundingRefs: _groundingRefs, ...request }) => request),
  });
}

const createTeachingDocumentToolOutputSchema = z
  .object({
    artifactId: z.string().uuid(),
    generationState: artifactGenerationStateSchema,
    kind: z.literal("teaching_document"),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

const createMindMapToolOutputSchema = z
  .object({
    artifactId: z.string().uuid(),
    generationState: artifactGenerationStateSchema,
    kind: z.literal("mind_map"),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

const createQuizToolOutputSchema = z
  .object({
    artifactId: z.string().uuid(),
    generationState: artifactGenerationStateSchema,
    kind: z.literal("quiz"),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

const createGameToolOutputSchema = z
  .object({
    artifactId: z.string().uuid(),
    generationState: artifactGenerationStateSchema,
    kind: z.literal("game"),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

const createPresentationToolOutputSchema = z
  .object({
    artifactId: z.string().uuid(),
    generationState: artifactGenerationStateSchema,
    kind: z.literal("presentation"),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

const createAnimationToolOutputSchema = z
  .object({
    artifactId: z.string().uuid(),
    generationState: artifactGenerationStateSchema,
    kind: z.literal("animation"),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

const artifactCreateToolOutputSchema = z.discriminatedUnion("kind", [
  createTeachingDocumentToolOutputSchema,
  createMindMapToolOutputSchema,
  createQuizToolOutputSchema,
  createGameToolOutputSchema,
  createPresentationToolOutputSchema,
  createAnimationToolOutputSchema,
]);

export function artifactCreationRequestFromPlanItem(
  item: ArtifactPlanItem,
): ArtifactCreationRequest {
  const base = {
    description: undefined,
    groundingRefs: item.groundingRefs,
    title: item.title,
  };
  const brief = {
    audience: null,
    objective: item.goal,
    requirements: item.requirements,
    subject: item.goal,
  };
  switch (item.kind) {
    case "teaching_document":
      return { ...base, brief: { ...brief, sections: [] }, kind: item.kind };
    case "mind_map":
      return { ...base, brief: { ...brief, branches: [] }, kind: item.kind };
    case "quiz":
      return {
        ...base,
        brief: {
          ...brief,
          questionPlan: { multipleChoice: 2, questionCount: 10, singleChoice: 6, trueFalse: 2 },
        },
        kind: item.kind,
      };
    case "game":
      return {
        ...base,
        brief: {
          ...brief,
          questionPlan: { questionCount: 10, singleChoice: 7, trueFalse: 3 },
          skin: "city_sunset",
        },
        kind: item.kind,
      };
    case "presentation":
      return { ...base, brief: { ...brief, sections: [], slideCount: null }, kind: item.kind };
    case "animation":
      return {
        ...base,
        brief: { ...brief, durationSeconds: null, scenes: [] },
        kind: item.kind,
      };
  }
}

export const createArtifactsToolOutputSchema = z
  .object({
    artifacts: z.array(artifactCreateToolOutputSchema).min(1).max(MAX_ARTIFACT_CREATIONS_PER_TURN),
    failedKinds: z
      .array(z.enum(["teaching_document", "mind_map", "quiz", "game", "presentation", "animation"]))
      .max(MAX_ARTIFACT_CREATIONS_PER_TURN),
    status: z.enum(["complete", "partial"]),
  })
  .strict()
  .superRefine((value, context) => {
    const complete = value.status === "complete";
    if (
      (complete && value.failedKinds.length !== 0) ||
      (!complete && value.failedKinds.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Creation status must match successful and failed artifact kinds",
      });
    }
    const resolvedKinds = [
      ...value.artifacts.map((artifact) => artifact.kind),
      ...value.failedKinds,
    ];
    if (new Set(resolvedKinds).size !== resolvedKinds.length) {
      context.addIssue({
        code: "custom",
        message: "Creation output must contain unique artifact kinds",
      });
    }
  });
