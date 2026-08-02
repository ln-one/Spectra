import { z } from "zod";
import type { PresentationRevisionContent } from "./contract";

export const presentationFocusSchema = z
  .object({
    kind: z.literal("presentation_slides"),
    revisionId: z.string().uuid(),
    slideIndexes: z.array(z.number().int().min(0).max(199)).min(1).max(200),
  })
  .strict()
  .superRefine((focus, context) => {
    if (new Set(focus.slideIndexes).size !== focus.slideIndexes.length) {
      context.addIssue({ code: "custom", message: "Focused slide indexes must be unique" });
    }
  });

export type PresentationFocus = z.infer<typeof presentationFocusSchema>;

const presentationRefinementFocusItemSchema = z
  .object({
    index: z.number().int().min(0).max(199),
    path: z.string().trim().min(1).max(500),
  })
  .strict();

export const presentationRefinementFocusSchema = z
  .array(presentationRefinementFocusItemSchema)
  .min(1)
  .max(200)
  .superRefine((focus, context) => {
    const indexes = focus.map((item) => item.index);
    if (new Set(indexes).size !== indexes.length) {
      context.addIssue({ code: "custom", message: "Focused slide indexes must be unique" });
    }
  });

export function validatePresentationFocus(
  content: PresentationRevisionContent,
  focus: PresentationFocus,
) {
  const parsed = presentationFocusSchema.parse(focus);
  return parsed.slideIndexes.every((index) => index < content.pageCount) ? parsed : null;
}
