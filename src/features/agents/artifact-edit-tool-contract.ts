import { z } from "zod";
import { teachingDocumentRefineEditsSchema } from "@/features/artifacts/documents/refine";
import { gameRefineEditsSchema } from "@/features/artifacts/games/refine";
import {
  mindMapProposalRefineEditsSchema,
  mindMapRefineEditsSchema,
} from "@/features/artifacts/mind-maps/refine";
import { presentationRefinementFocusSchema } from "@/features/artifacts/presentations/refine";
import {
  type MindMapEditProposal,
  mindMapEditProposalSchema,
  type QuizEditProposal,
  quizEditProposalSchema,
  teachingDocumentEditProposalSchema,
} from "@/features/artifacts/proposal-contract";
import { quizRefineEditsSchema } from "@/features/artifacts/quizzes/refine";
import { artifactKindSchema } from "@/features/artifacts/types";
import { artifactGroundingRefsSchema } from "./artifact-tool-protocol";

export const proposeCurrentTeachingDocumentEditsToolInputSchema = z
  .object({
    edits: teachingDocumentRefineEditsSchema,
    groundingRefs: artifactGroundingRefsSchema.default([]),
    summary: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe("A concise user-facing summary of the proposed revision."),
  })
  .strict();

export const teachingDocumentEditProposalToolOutputSchema = teachingDocumentEditProposalSchema;

export const applyCurrentMindMapEditsToolInputSchema = z
  .object({ edits: mindMapRefineEditsSchema })
  .strict();

export const applyCurrentGameEditsToolInputSchema = z
  .object({ edits: gameRefineEditsSchema })
  .strict();

export const applyCurrentQuizEditsToolInputSchema = z
  .object({ edits: quizRefineEditsSchema })
  .strict();

const proposalSummarySchema = z.string().trim().min(1).max(500);

export const proposeCurrentMindMapEditsToolInputSchema = z
  .object({
    edits: mindMapProposalRefineEditsSchema,
    groundingRefs: artifactGroundingRefsSchema.default([]),
    summary: proposalSummarySchema,
  })
  .strict();

export const mindMapEditProposalToolOutputSchema = mindMapEditProposalSchema;

export const proposeCurrentQuizEditsToolInputSchema = z
  .object({
    edits: quizRefineEditsSchema,
    groundingRefs: artifactGroundingRefsSchema.default([]),
    summary: proposalSummarySchema,
  })
  .strict();

export const quizEditProposalToolOutputSchema = quizEditProposalSchema;
export type { MindMapEditProposal, QuizEditProposal };

export const proposeCurrentPresentationEditsToolInputSchema = z
  .object({
    focus: presentationRefinementFocusSchema.optional(),
    groundingRefs: artifactGroundingRefsSchema.default([]),
    instruction: z.string().trim().min(1).max(20_000),
    summary: proposalSummarySchema.optional(),
  })
  .strict();

export const presentationRefinementQueuedToolOutputSchema = z
  .object({
    artifactId: z.string().uuid(),
    baseRevisionId: z.string().uuid(),
    kind: z.literal("presentation"),
    runId: z.string().uuid(),
    state: z.literal("queued"),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const currentArtifactUpdateToolOutputSchema = z
  .object({
    artifactId: z.string().uuid(),
    generationState: z.literal("ready"),
    kind: artifactKindSchema,
    revisionId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
  })
  .strict();
