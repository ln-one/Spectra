import { z } from "zod";
import { animationDetailSchema } from "./animations/types";
import { teachingDocumentDraftEventSchema } from "./documents/realtime";
import { teachingDocumentFocusSchema } from "./documents/refine";
import { teachingDocumentDetailSchema } from "./documents/types";
import { gameDetailSchema } from "./games/types";
import { mindMapDraftEventSchema } from "./mind-maps/realtime";
import { mindMapFocusSchema } from "./mind-maps/refine";
import { mindMapDetailSchema } from "./mind-maps/types";
import { presentationDraftEventSchema } from "./presentations/realtime";
import { presentationFocusSchema } from "./presentations/refine";
import { presentationDetailSchema } from "./presentations/types";
import type {
  MindMapEditProposal,
  PresentationEditProposal,
  QuizEditProposal,
  TeachingDocumentEditProposal,
} from "./proposal-contract";
import { quizFocusSchema } from "./quizzes/refine";
import { quizDetailSchema } from "./quizzes/types";
import { type ArtifactKind, artifactHistoryItemSchema } from "./types";

export const artifactDetailSchema = z.union([
  teachingDocumentDetailSchema,
  mindMapDetailSchema,
  quizDetailSchema,
  gameDetailSchema,
  presentationDetailSchema,
  animationDetailSchema,
]);

export const artifactDraftEventSchema = z.union([
  teachingDocumentDraftEventSchema,
  mindMapDraftEventSchema,
  presentationDraftEventSchema,
]);

export type ArtifactDraftEvent = z.infer<typeof artifactDraftEventSchema>;
export type ArtifactDetail = z.infer<typeof artifactDetailSchema>;

type ArtifactCreateInput = {
  conversationId: string;
  locale: "zh-CN" | "en-US";
  prompt: string;
  requestedTitle?: string;
  rootRunId?: string | null;
  sourcePlanItemId?: string | null;
  sourceUserMessageId: string;
  workspaceId: string;
};

export type ArtifactContracts = {
  teaching_document: {
    create: ArtifactCreateInput;
    detail: z.infer<typeof teachingDocumentDetailSchema>;
    draftEvent: z.infer<typeof teachingDocumentDraftEventSchema>;
    proposal: TeachingDocumentEditProposal;
    selection: z.infer<typeof teachingDocumentFocusSchema>;
  };
  mind_map: {
    create: ArtifactCreateInput;
    detail: z.infer<typeof mindMapDetailSchema>;
    draftEvent: z.infer<typeof mindMapDraftEventSchema>;
    proposal: MindMapEditProposal;
    selection: z.infer<typeof mindMapFocusSchema>;
  };
  quiz: {
    create: ArtifactCreateInput;
    detail: z.infer<typeof quizDetailSchema>;
    draftEvent: null;
    proposal: QuizEditProposal;
    selection: z.infer<typeof quizFocusSchema>;
  };
  game: {
    create: ArtifactCreateInput;
    detail: z.infer<typeof gameDetailSchema>;
    draftEvent: null;
    proposal: null;
    selection: null;
  };
  presentation: {
    create: ArtifactCreateInput;
    detail: z.infer<typeof presentationDetailSchema>;
    draftEvent: z.infer<typeof presentationDraftEventSchema>;
    proposal: PresentationEditProposal;
    selection: z.infer<typeof presentationFocusSchema>;
  };
  animation: {
    create: ArtifactCreateInput & {
      durationSeconds?: number;
    };
    detail: z.infer<typeof animationDetailSchema>;
    draftEvent: null;
    proposal: null;
    selection: null;
  };
};

export type ArtifactDetailFor<Kind extends ArtifactKind> = ArtifactContracts[Kind]["detail"];
export type ArtifactDraftEventFor<Kind extends ArtifactKind> =
  ArtifactContracts[Kind]["draftEvent"];
export type ArtifactProposalFor<Kind extends ArtifactKind> = ArtifactContracts[Kind]["proposal"];
export type ArtifactSelectionFor<Kind extends ArtifactKind> = ArtifactContracts[Kind]["selection"];
export type ArtifactSelection = Exclude<
  { [Kind in ArtifactKind]: ArtifactSelectionFor<Kind> }[ArtifactKind],
  null
>;

export const artifactSelectionSchemas = {
  animation: z.null(),
  game: z.null(),
  mind_map: mindMapFocusSchema,
  presentation: presentationFocusSchema,
  quiz: quizFocusSchema,
  teaching_document: teachingDocumentFocusSchema,
} satisfies { [Kind in ArtifactKind]: z.ZodType<ArtifactSelectionFor<Kind>> };

export function parseArtifactSelection<Kind extends ArtifactKind>(
  kind: Kind,
  value: unknown,
): ArtifactSelectionFor<Kind> {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > 32_768) {
    throw new Error("artifact_selection_too_large");
  }
  return artifactSelectionSchemas[kind].parse(value) as ArtifactSelectionFor<Kind>;
}

export function artifactKindForInteractionSelection(selection: ArtifactSelection): ArtifactKind {
  switch (selection.kind) {
    case "teaching_document_blocks":
      return "teaching_document";
    case "mind_map_subtrees":
      return "mind_map";
    case "quiz_questions":
      return "quiz";
    case "presentation_slides":
      return "presentation";
  }
}

export function artifactHistoryItemFromDetail(detail: ArtifactDetail) {
  return artifactHistoryItemSchema.parse({
    createdAt: detail.createdAt,
    currentRevisionId: detail.artifact?.currentRevision.id ?? null,
    generationState: detail.generationState,
    id: detail.id,
    kind: detail.kind,
    title: detail.title,
    updatedAt: detail.updatedAt,
  });
}
