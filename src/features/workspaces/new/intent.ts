import { z } from "zod";
import { createWorkspaceSchema } from "../validation";

const workspaceCreationIntentSchema = z
  .object({
    idea: z.string().trim().min(1).max(5_000),
    projectName: z.string().trim().max(200),
  })
  .strict();

function nameFromIdea(idea: string) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let name = "";
  for (const { segment } of segmenter.segment(idea)) {
    if (name.length + segment.length > 200) break;
    name += segment;
  }
  return name;
}

export function workspaceInputFromCreationIntent(input: unknown) {
  const intent = workspaceCreationIntentSchema.parse(input);
  return createWorkspaceSchema.parse({
    // AI naming is deferred; the user's idea remains the honest fallback.
    name: intent.projectName || nameFromIdea(intent.idea),
  });
}
