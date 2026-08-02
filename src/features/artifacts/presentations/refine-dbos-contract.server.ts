import { z } from "zod";
import { presentationEditProposalSchema } from "../proposal-contract";
import { presentationRefinementFocusSchema } from "./refine";

export const presentationRefinementWorkflowInputSchema = z
  .object({
    actor: z
      .object({
        handle: z.string().min(1),
        principalId: z.string().uuid(),
      })
      .strict(),
    artifactId: z.string().uuid(),
    baseRevisionId: z.string().uuid(),
    conversationId: z.string().uuid(),
    focus: presentationRefinementFocusSchema,
    instruction: z.string().trim().min(1).max(20_000),
    runId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export const presentationRefinementEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      baseRevisionId: z.string().uuid(),
      runId: z.string().uuid(),
      type: z.literal("prepared"),
    })
    .strict(),
  z
    .object({
      conversationId: z.string().uuid(),
      runId: z.string().uuid(),
      type: z.literal("authoring_started"),
    })
    .strict(),
  z
    .object({
      changedSlidePaths: z.array(z.string().min(1).max(500)).min(1).max(2_000),
      runId: z.string().uuid(),
      type: z.literal("candidate_validated"),
    })
    .strict(),
  z
    .object({
      proposal: presentationEditProposalSchema,
      runId: z.string().uuid(),
      type: z.literal("proposal_published"),
    })
    .strict(),
  z
    .object({
      failureCode: z.string().trim().min(1).max(100),
      runId: z.string().uuid(),
      type: z.literal("failed"),
    })
    .strict(),
]);

export type PresentationRefinementWorkflowInput = z.infer<
  typeof presentationRefinementWorkflowInputSchema
>;
export type PresentationRefinementEvent = z.infer<typeof presentationRefinementEventSchema>;
