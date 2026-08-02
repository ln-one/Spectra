import { z } from "zod";

export const knowledgeEvidenceContextSchema = z
  .object({
    evidenceId: z.string().uuid(),
    contextText: z.string().min(1).max(1_200),
    exactExcerpt: z.string().min(1),
    highlight: z
      .object({
        start: z.number().int().min(0),
        end: z.number().int().positive(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.highlight &&
      (value.highlight.end <= value.highlight.start ||
        value.highlight.end > value.contextText.length)
    ) {
      context.addIssue({
        code: "custom",
        message: "Highlight must identify a non-empty range inside contextText",
        path: ["highlight"],
      });
    }
  });

export type KnowledgeEvidenceContext = z.infer<typeof knowledgeEvidenceContextSchema>;
