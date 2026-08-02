"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { z } from "zod";
import { animationDetailSchema } from "@/features/artifacts/animations/types";
import {
  type ArtifactDetail,
  type ArtifactDetailFor,
  type ArtifactDraftEventFor,
  type ArtifactProposalFor,
  type ArtifactSelectionFor,
  artifactSelectionSchemas,
} from "@/features/artifacts/contract";
import { readyTeachingDocumentDetail } from "@/features/artifacts/documents/queries";
import {
  applyTeachingDocumentDraftEvent,
  teachingDocumentDraftEventSchema,
} from "@/features/artifacts/documents/realtime";
import { teachingDocumentDetailSchema } from "@/features/artifacts/documents/types";
import { gameDetailSchema } from "@/features/artifacts/games/types";
import { mindMapDraftEventSchema } from "@/features/artifacts/mind-maps/realtime";
import { type MindMapArtifact, mindMapDetailSchema } from "@/features/artifacts/mind-maps/types";
import {
  applyPresentationDraftEvent,
  presentationDraftEventSchema,
} from "@/features/artifacts/presentations/realtime";
import { presentationDetailSchema } from "@/features/artifacts/presentations/types";
import {
  mindMapEditProposalSchema,
  presentationEditProposalSchema,
  quizEditProposalSchema,
  teachingDocumentEditProposalSchema,
} from "@/features/artifacts/proposal-contract";
import { type QuizArtifact, quizDetailSchema } from "@/features/artifacts/quizzes/types";
import type { ArtifactKind } from "@/features/artifacts/types";
import { AnimationWorkspaceView } from "./AnimationWorkspaceView";
import type { ArtifactWorkspacePhase } from "./artifactWorkbench";
import { GameWorkspaceView } from "./GameWorkspaceView";
import { PresentationWorkspaceView } from "./PresentationWorkspaceView";
import { QuizWorkspaceView } from "./QuizWorkspaceView";
import { TeachingDocumentWorkspaceView } from "./TeachingDocumentWorkspaceView";

const MindMapWorkspaceView = dynamic(
  () => import("./MindMapWorkspaceView").then((module) => module.MindMapWorkspaceView),
  { ssr: false },
);

type ArtifactWorkspaceProps<Kind extends ArtifactKind = ArtifactKind> = {
  conversationId: string;
  detail: ArtifactDetailFor<Kind> | null;
  onBack: () => void;
  onDetailUpdated: (detail: ArtifactDetail) => void;
  onProposalDismiss?: () => void;
  onProposalRetry?: (request: string) => void;
  onRequestAssistant?: () => void;
  onSelectionChange?: (selection: ArtifactSelectionFor<Kind> | null) => void;
  onSuggestion: (prompt: string) => void;
  phase: ArtifactWorkspacePhase;
  readOnly?: boolean;
  proposal: ArtifactProposalFor<Kind> | null;
  selection: ArtifactSelectionFor<Kind> | null;
  workspaceId: string;
};

type ArtifactClientModule<Kind extends ArtifactKind> = {
  Workspace: ComponentType<ArtifactWorkspaceProps<Kind>>;
  applyDraftEvent: (
    detail: ArtifactDetailFor<Kind>,
    event: ArtifactDraftEventFor<Kind>,
  ) => ArtifactDetailFor<Kind>;
  detailSchema: z.ZodType<ArtifactDetailFor<Kind>>;
  draftEventSchema: z.ZodType<ArtifactDraftEventFor<Kind>>;
  kind: Kind;
  proposalSchema: z.ZodType<ArtifactProposalFor<Kind>>;
  selectionSchema: z.ZodType<ArtifactSelectionFor<Kind>>;
};

function TeachingDocumentWorkspace(props: ArtifactWorkspaceProps<"teaching_document">) {
  return (
    <TeachingDocumentWorkspaceView
      artifact={props.detail?.artifact ?? null}
      conversationId={props.conversationId}
      draft={props.detail?.draft ?? null}
      failureCode={props.detail?.failureCode ?? null}
      pendingTitle={props.detail?.title ?? null}
      queued={props.detail?.generationState === "queued"}
      onArtifactUpdated={(artifact) => props.onDetailUpdated(readyTeachingDocumentDetail(artifact))}
      onBack={props.onBack}
      onSuggestion={props.onSuggestion}
      focus={props.selection}
      proposal={props.proposal}
      onFocusChange={props.onSelectionChange}
      {...(props.onProposalDismiss ? { onProposalDismiss: props.onProposalDismiss } : {})}
      onProposalRetry={props.onProposalRetry}
      onRequestAssistant={props.onRequestAssistant}
      phase={props.phase}
      readOnly={props.readOnly ?? false}
      workspaceId={props.workspaceId}
    />
  );
}

function readyMindMapDetail(artifact: MindMapArtifact): ArtifactDetailFor<"mind_map"> {
  return {
    artifact,
    createdAt: artifact.createdAt,
    draft: null,
    failureCode: null,
    generationAttemptId: null,
    generationState: "ready",
    id: artifact.id,
    kind: "mind_map",
    generationSequence: 0,
    title: artifact.title,
    updatedAt: artifact.updatedAt,
    workspaceId: artifact.workspaceId,
  };
}

function MindMapWorkspace(props: ArtifactWorkspaceProps<"mind_map">) {
  return (
    <MindMapWorkspaceView
      artifact={props.detail?.artifact ?? null}
      conversationId={props.conversationId}
      draft={props.detail?.draft ?? null}
      failureCode={props.detail?.failureCode ?? null}
      onArtifactUpdated={(artifact) => props.onDetailUpdated(readyMindMapDetail(artifact))}
      onBack={props.onBack}
      onSuggestion={props.onSuggestion}
      pendingTitle={props.detail?.title ?? null}
      phase={props.phase}
      readOnly={props.readOnly ?? false}
      workspaceId={props.workspaceId}
      proposal={props.proposal}
      {...(props.onSelectionChange ? { onFocusChange: props.onSelectionChange } : {})}
      {...(props.onProposalDismiss ? { onProposalDismiss: props.onProposalDismiss } : {})}
    />
  );
}

function readyQuizDetail(artifact: QuizArtifact): ArtifactDetailFor<"quiz"> {
  return {
    artifact,
    createdAt: artifact.createdAt,
    failureCode: null,
    generationAttemptId: null,
    generationSequence: 0,
    generationState: "ready",
    id: artifact.id,
    kind: "quiz",
    title: artifact.title,
    updatedAt: artifact.updatedAt,
    workspaceId: artifact.workspaceId,
  };
}

function QuizWorkspace(props: ArtifactWorkspaceProps<"quiz">) {
  return (
    <QuizWorkspaceView
      artifact={props.detail?.artifact ?? null}
      conversationId={props.conversationId}
      failureCode={props.detail?.failureCode ?? null}
      onArtifactUpdated={(artifact) => props.onDetailUpdated(readyQuizDetail(artifact))}
      onBack={props.onBack}
      onSuggestion={props.onSuggestion}
      pendingTitle={props.detail?.title ?? null}
      phase={props.phase}
      readOnly={props.readOnly ?? false}
      workspaceId={props.workspaceId}
      focus={props.selection}
      proposal={props.proposal}
      {...(props.onSelectionChange ? { onFocusChange: props.onSelectionChange } : {})}
      {...(props.onProposalDismiss ? { onProposalDismiss: props.onProposalDismiss } : {})}
    />
  );
}

function GameWorkspace(props: ArtifactWorkspaceProps<"game">) {
  return (
    <GameWorkspaceView
      artifact={props.detail?.artifact ?? null}
      conversationId={props.conversationId}
      failureCode={props.detail?.failureCode ?? null}
      onBack={props.onBack}
      onSuggestion={props.onSuggestion}
      pendingTitle={props.detail?.title ?? null}
      phase={props.phase}
      workspaceId={props.workspaceId}
    />
  );
}

function PresentationWorkspace(props: ArtifactWorkspaceProps<"presentation">) {
  return (
    <PresentationWorkspaceView
      conversationId={props.conversationId}
      detail={props.detail}
      onBack={props.onBack}
      onDetailUpdated={props.onDetailUpdated}
      onSuggestion={props.onSuggestion}
      {...(props.onProposalDismiss ? { onProposalDismiss: props.onProposalDismiss } : {})}
      proposal={props.proposal}
      phase={props.phase}
      readOnly={props.readOnly ?? false}
      {...(props.onSelectionChange ? { onSelectionChange: props.onSelectionChange } : {})}
      workspaceId={props.workspaceId}
    />
  );
}

function AnimationWorkspace(props: ArtifactWorkspaceProps<"animation">) {
  return (
    <AnimationWorkspaceView
      conversationId={props.conversationId}
      detail={props.detail}
      onBack={props.onBack}
      onDetailUpdated={props.onDetailUpdated}
      onSuggestion={props.onSuggestion}
      phase={props.phase}
      readOnly={props.readOnly ?? false}
      workspaceId={props.workspaceId}
    />
  );
}

const artifactClientModules = {
  animation: {
    Workspace: AnimationWorkspace,
    applyDraftEvent: (detail) => detail,
    detailSchema: animationDetailSchema,
    draftEventSchema: z.null(),
    kind: "animation",
    proposalSchema: z.null(),
    selectionSchema: artifactSelectionSchemas.animation,
  },
  presentation: {
    Workspace: PresentationWorkspace,
    applyDraftEvent: applyPresentationDraftEvent,
    detailSchema: presentationDetailSchema,
    draftEventSchema: presentationDraftEventSchema,
    kind: "presentation",
    proposalSchema: presentationEditProposalSchema,
    selectionSchema: artifactSelectionSchemas.presentation,
  },
  game: {
    Workspace: GameWorkspace,
    applyDraftEvent: (detail) => detail,
    detailSchema: gameDetailSchema,
    draftEventSchema: z.null(),
    kind: "game",
    proposalSchema: z.null(),
    selectionSchema: artifactSelectionSchemas.game,
  },
  quiz: {
    Workspace: QuizWorkspace,
    applyDraftEvent: (detail) => detail,
    detailSchema: quizDetailSchema,
    draftEventSchema: z.null(),
    kind: "quiz",
    proposalSchema: quizEditProposalSchema,
    selectionSchema: artifactSelectionSchemas.quiz,
  },
  mind_map: {
    Workspace: MindMapWorkspace,
    applyDraftEvent: (detail, event) => {
      if (
        detail.generationState !== "queued" &&
        detail.generationState !== "generating" &&
        detail.generationState !== "finalizing"
      )
        return detail;
      if (event.sequence <= detail.generationSequence) return detail;
      const root = event.draft.nodes.find((node) => node.id === event.draft.rootId);
      return {
        ...detail,
        draft: event.draft,
        generationSequence: event.sequence,
        title: root?.label ?? detail.title,
      };
    },
    detailSchema: mindMapDetailSchema,
    draftEventSchema: mindMapDraftEventSchema,
    kind: "mind_map",
    proposalSchema: mindMapEditProposalSchema,
    selectionSchema: artifactSelectionSchemas.mind_map,
  },
  teaching_document: {
    Workspace: TeachingDocumentWorkspace,
    applyDraftEvent: (detail, event) => {
      if (
        detail.generationState !== "queued" &&
        detail.generationState !== "generating" &&
        detail.generationState !== "finalizing"
      )
        return detail;
      if (event.sequence <= detail.generationSequence) return detail;
      const draft = applyTeachingDocumentDraftEvent(detail.draft, event);
      return {
        ...detail,
        draft,
        generationSequence: event.sequence,
      };
    },
    detailSchema: teachingDocumentDetailSchema,
    draftEventSchema: teachingDocumentDraftEventSchema,
    kind: "teaching_document",
    proposalSchema: teachingDocumentEditProposalSchema,
    selectionSchema: artifactSelectionSchemas.teaching_document,
  },
} satisfies { [Kind in ArtifactKind]: ArtifactClientModule<Kind> };

export function artifactClientModule<Kind extends ArtifactKind>(kind: Kind) {
  return artifactClientModules[kind];
}
