import { z } from "zod";
import { teachingDocumentRefineEditsSchema } from "./documents/refine";
import { artifactOperationGroundingReceiptSchema } from "./grounding";
import { mindMapRevisionContentSchema } from "./mind-maps/contract";
import { mindMapRefineEditsSchema } from "./mind-maps/refine";
import { presentationRefinementFocusSchema } from "./presentations/refine";
import { quizRevisionContentSchema } from "./quizzes/contract";
import { quizRefineEditsSchema } from "./quizzes/refine";

export const ARTIFACT_PROPOSAL_TOOL_IDS = {
  mindMap: "propose_current_mind_map_edits",
  quiz: "propose_current_quiz_edits",
  teachingDocument: "propose_current_teaching_document_edits",
  presentation: "propose_current_presentation_edits",
} as const;

const proposalSummarySchema = z.string().trim().min(1).max(500);

export const teachingDocumentEditProposalSchema = z
  .object({
    artifactId: z.string().uuid(),
    baseRevisionId: z.string().uuid(),
    edits: teachingDocumentRefineEditsSchema,
    kind: z.literal("teaching_document"),
    request: z.string().trim().min(1).max(20_000),
    runId: z.string().uuid(),
    summary: proposalSummarySchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const mindMapEditProposalSchema = z
  .object({
    artifactId: z.string().uuid(),
    baseRevisionId: z.string().uuid(),
    content: mindMapRevisionContentSchema,
    edits: mindMapRefineEditsSchema,
    kind: z.literal("mind_map"),
    request: z.string().trim().min(1).max(20_000),
    runId: z.string().uuid(),
    summary: proposalSummarySchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const quizEditProposalSchema = z
  .object({
    artifactId: z.string().uuid(),
    baseRevisionId: z.string().uuid(),
    content: quizRevisionContentSchema,
    edits: quizRefineEditsSchema,
    kind: z.literal("quiz"),
    request: z.string().trim().min(1).max(20_000),
    runId: z.string().uuid(),
    summary: proposalSummarySchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const presentationEditProposalSchema = z
  .object({
    artifactId: z.string().uuid(),
    baseRevisionId: z.string().uuid(),
    candidateSourceBundleId: z.string().uuid(),
    changedSlidePaths: z.array(z.string().trim().min(1).max(500)).min(1).max(2_000),
    focus: presentationRefinementFocusSchema,
    kind: z.literal("presentation"),
    request: z.string().trim().min(1).max(20_000),
    runId: z.string().uuid(),
    summary: proposalSummarySchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const artifactEditProposalSchema = z.discriminatedUnion("kind", [
  teachingDocumentEditProposalSchema,
  mindMapEditProposalSchema,
  presentationEditProposalSchema,
  quizEditProposalSchema,
]);

export const artifactEditProposalEnvelopeSchema = z
  .object({
    groundingReceipt: artifactOperationGroundingReceiptSchema,
    proposal: artifactEditProposalSchema,
    version: z.literal(1),
  })
  .strict();

export type TeachingDocumentEditProposal = z.infer<typeof teachingDocumentEditProposalSchema>;
export type MindMapEditProposal = z.infer<typeof mindMapEditProposalSchema>;
export type QuizEditProposal = z.infer<typeof quizEditProposalSchema>;
export type PresentationEditProposal = z.infer<typeof presentationEditProposalSchema>;
export type ArtifactEditProposal = z.infer<typeof artifactEditProposalSchema>;
