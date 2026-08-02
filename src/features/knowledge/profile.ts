import { z } from "zod";

const knowledgeProfileSchema = z
  .object({
    id: z.string().min(1),
    capacityCounter: z.literal("unicode-codepoint-v1"),
    chunk: z.object({ maxUnits: z.int().positive(), overlap: z.literal(0) }).strict(),
    context: z.object({ neighborBlocks: z.literal(1), maxUnits: z.int().positive() }).strict(),
    retrieval: z
      .object({
        candidateLimit: z.int().positive(),
        outputLimit: z.int().positive(),
        wrrfK: z.int().positive(),
        weights: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
      })
      .strict(),
    packing: z
      .object({ maxUnits: z.int().positive(), maxEvidenceUnits: z.int().positive() })
      .strict(),
  })
  .strict()
  .superRefine((profile, context) => {
    if (profile.retrieval.outputLimit > profile.retrieval.candidateLimit) {
      context.addIssue({
        code: "custom",
        message: "outputLimit must not exceed candidateLimit",
        path: ["retrieval", "outputLimit"],
      });
    }
    if (!profile.retrieval.weights.some((weight) => weight > 0)) {
      context.addIssue({
        code: "custom",
        message: "at least one WRRF weight must be positive",
        path: ["retrieval", "weights"],
      });
    }
  });

export const knowledgeProfileV1 = knowledgeProfileSchema.parse({
  id: "spectra-knowledge-v1",
  capacityCounter: "unicode-codepoint-v1",
  chunk: { maxUnits: 512, overlap: 0 },
  context: { neighborBlocks: 1, maxUnits: 2048 },
  retrieval: { candidateLimit: 20, outputLimit: 10, wrrfK: 60, weights: [1, 1] },
  packing: { maxUnits: 12_000, maxEvidenceUnits: 32 },
});

export const knowledgeProfileV3 = knowledgeProfileSchema.parse({
  ...knowledgeProfileV1,
  id: "spectra-knowledge-v3",
});

export type KnowledgeProfile = z.infer<typeof knowledgeProfileSchema>;

export function countCapacityUnits(text: string) {
  return Array.from(text).length;
}
