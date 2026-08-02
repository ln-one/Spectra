import "server-only";

import type { z } from "zod";
import { TeachingDocumentError } from "@/features/artifacts/documents/errors";
import { teachingDocumentMarkdownPage } from "@/features/artifacts/documents/markdown";
import {
  applyTeachingDocumentRefineEdits,
  reviewTeachingDocumentProposalScope,
  teachingDocumentMarkdownPageWithBlockIds,
} from "@/features/artifacts/documents/refine";
import { ArtifactError } from "@/features/artifacts/errors";
import { GameError } from "@/features/artifacts/games/errors";
import { gameMarkdownPage } from "@/features/artifacts/games/markdown";
import { applyGameRefineEdits } from "@/features/artifacts/games/refine";
import { MindMapError } from "@/features/artifacts/mind-maps/errors";
import { mindMapMarkdownPage } from "@/features/artifacts/mind-maps/markdown";
import {
  applyMindMapRefineEdits,
  reviewMindMapProposalScope,
} from "@/features/artifacts/mind-maps/refine";
import { presentationRefinementFocusSchema } from "@/features/artifacts/presentations/refine";
import { applyQuizEdits } from "@/features/artifacts/quizzes/editor";
import { QuizError } from "@/features/artifacts/quizzes/errors";
import { quizMarkdownPage } from "@/features/artifacts/quizzes/markdown";
import { applyQuizRefineEdits, reviewQuizProposalScope } from "@/features/artifacts/quizzes/refine";
import { WorkspaceError } from "@/features/workspaces/errors";
import type { ArtifactToolDependencies } from "./artifact-composition.server";
import {
  type applyCurrentGameEditsToolInputSchema,
  type applyCurrentMindMapEditsToolInputSchema,
  type applyCurrentQuizEditsToolInputSchema,
  mindMapEditProposalToolOutputSchema,
  presentationRefinementQueuedToolOutputSchema,
  type proposeCurrentMindMapEditsToolInputSchema,
  type proposeCurrentPresentationEditsToolInputSchema,
  type proposeCurrentQuizEditsToolInputSchema,
  type proposeCurrentTeachingDocumentEditsToolInputSchema,
  quizEditProposalToolOutputSchema,
  teachingDocumentEditProposalToolOutputSchema,
} from "./artifact-edit-tool-contract";
import type { WorkspaceAgentToolContext } from "./workspace-agent-tool-context";

type ArtifactDetailSurface = Extract<
  WorkspaceAgentToolContext["surface"],
  { type: "artifact_detail" }
>;

type ReadyArtifactSurface = ArtifactDetailSurface & {
  expectedRevisionId: string;
};

type TeachingDocumentProposalInput = z.infer<
  typeof proposeCurrentTeachingDocumentEditsToolInputSchema
>;
type MindMapProposalInput = z.infer<typeof proposeCurrentMindMapEditsToolInputSchema>;
type QuizProposalInput = z.infer<typeof proposeCurrentQuizEditsToolInputSchema>;
type PresentationRefinementInput = z.infer<typeof proposeCurrentPresentationEditsToolInputSchema>;
type MindMapUpdateInput = z.infer<typeof applyCurrentMindMapEditsToolInputSchema>;
type GameUpdateInput = z.infer<typeof applyCurrentGameEditsToolInputSchema>;
type QuizUpdateInput = z.infer<typeof applyCurrentQuizEditsToolInputSchema>;

function inaccessibleArtifact(error: unknown): never {
  if (
    error instanceof ArtifactError ||
    error instanceof GameError ||
    error instanceof MindMapError ||
    error instanceof TeachingDocumentError ||
    error instanceof QuizError ||
    error instanceof WorkspaceError
  ) {
    throw new Error("artifact_not_accessible");
  }
  throw error;
}

function proposalScopeViolation(detail: string): never {
  throw new Error(`proposal_scope_violation: ${detail}`);
}

function throwCurrentArtifactConflict(error: unknown): never {
  if (
    (error instanceof TeachingDocumentError && error.code === "teaching_document_conflict") ||
    (error instanceof MindMapError && error.code === "mind_map_conflict") ||
    (error instanceof GameError && error.code === "game_conflict") ||
    (error instanceof QuizError && error.code === "quiz_conflict")
  ) {
    throw new Error("current_artifact_revision_conflict_refresh_required");
  }
  throw error;
}

export function createArtifactCommandAdapters(dependencies: ArtifactToolDependencies) {
  const getMindMapDetail = dependencies.getMindMapDetail;
  const getGameDetail = dependencies.getGameDetail;
  const getQuizDetail = dependencies.getQuizDetail;
  const saveMindMapRevision = dependencies.saveMindMapRevision;
  const saveGameRevision = dependencies.saveGameRevision;
  const saveQuizRevision = dependencies.saveQuizRevision;
  const getPresentationDetail = dependencies.getPresentationDetail;
  const enqueuePresentationRefinement = dependencies.enqueuePresentationRefinement;

  return {
    async applyMindMap(
      scope: WorkspaceAgentToolContext,
      surface: ReadyArtifactSurface,
      input: MindMapUpdateInput,
    ) {
      if (!getMindMapDetail || !saveMindMapRevision) {
        throw new Error("mind_map_editing_unavailable");
      }
      const detail = await getMindMapDetail(scope.actor, {
        artifactId: surface.artifactId,
        conversationId: scope.conversationId,
        workspaceId: scope.workspaceId,
      });
      if (detail.generationState !== "ready") throw new Error("current_artifact_not_editable");
      const content = applyMindMapRefineEdits(detail.artifact.currentRevision.content, input.edits);
      const artifact = await saveMindMapRevision(scope.actor, {
        artifactId: surface.artifactId,
        content,
        conversationId: scope.conversationId,
        expectedRevisionId: surface.expectedRevisionId,
        producingRunId: scope.rootRunId,
        workspaceId: scope.workspaceId,
      }).catch(throwCurrentArtifactConflict);
      const eventData = await getMindMapDetail(scope.actor, {
        artifactId: artifact.id,
        conversationId: scope.conversationId,
        workspaceId: scope.workspaceId,
      });
      return {
        eventData,
        output: {
          artifactId: artifact.id,
          generationState: "ready" as const,
          kind: "mind_map" as const,
          revisionId: artifact.currentRevision.id,
          title: artifact.title,
        },
      };
    },

    async applyQuiz(
      scope: WorkspaceAgentToolContext,
      surface: ReadyArtifactSurface,
      input: QuizUpdateInput,
    ) {
      if (!getQuizDetail || !saveQuizRevision) {
        throw new Error("quiz_editing_unavailable");
      }
      const detail = await getQuizDetail(scope.actor, {
        artifactId: surface.artifactId,
        conversationId: scope.conversationId,
        workspaceId: scope.workspaceId,
      });
      if (detail.generationState !== "ready") throw new Error("current_artifact_not_editable");
      const content = applyQuizEdits(detail.artifact.currentRevision.content, input.edits);
      const artifact = await saveQuizRevision(scope.actor, {
        artifactId: surface.artifactId,
        content,
        conversationId: scope.conversationId,
        expectedRevisionId: surface.expectedRevisionId,
        producingRunId: scope.rootRunId,
        workspaceId: scope.workspaceId,
      }).catch(throwCurrentArtifactConflict);
      const eventData = await getQuizDetail(scope.actor, {
        artifactId: artifact.id,
        conversationId: scope.conversationId,
        workspaceId: scope.workspaceId,
      });
      return {
        eventData,
        output: {
          artifactId: artifact.id,
          generationState: "ready" as const,
          kind: "quiz" as const,
          revisionId: artifact.currentRevision.id,
          title: artifact.title,
        },
      };
    },

    async applyGame(
      scope: WorkspaceAgentToolContext,
      surface: ReadyArtifactSurface,
      input: GameUpdateInput,
    ) {
      if (!getGameDetail || !saveGameRevision) {
        throw new Error("game_editing_unavailable");
      }
      const detail = await getGameDetail(scope.actor, {
        artifactId: surface.artifactId,
        conversationId: scope.conversationId,
        workspaceId: scope.workspaceId,
      });
      if (detail.generationState !== "ready") throw new Error("current_artifact_not_editable");
      const content = applyGameRefineEdits(detail.artifact.currentRevision.content, input.edits);
      const artifact = await saveGameRevision(scope.actor, {
        artifactId: surface.artifactId,
        content,
        conversationId: scope.conversationId,
        expectedRevisionId: surface.expectedRevisionId,
        producingRunId: scope.rootRunId,
        workspaceId: scope.workspaceId,
      }).catch(throwCurrentArtifactConflict);
      const eventData = await getGameDetail(scope.actor, {
        artifactId: artifact.id,
        conversationId: scope.conversationId,
        workspaceId: scope.workspaceId,
      });
      return {
        eventData,
        output: {
          artifactId: artifact.id,
          generationState: "ready" as const,
          kind: "game" as const,
          revisionId: artifact.currentRevision.id,
          title: artifact.title,
        },
      };
    },

    async createMindMapProposal(
      scope: WorkspaceAgentToolContext,
      surface: ReadyArtifactSurface,
      input: MindMapProposalInput,
    ) {
      if (!getMindMapDetail) throw new Error("mind_map_editing_unavailable");
      const detail = await getMindMapDetail(scope.actor, {
        artifactId: surface.artifactId,
        conversationId: scope.conversationId,
        workspaceId: scope.workspaceId,
      });
      if (detail.generationState !== "ready") throw new Error("current_artifact_not_editable");
      if (detail.artifact.currentRevision.id !== surface.expectedRevisionId) {
        throw new Error("current_artifact_revision_conflict_refresh_required");
      }
      const focus = surface.focus?.kind === "mind_map_subtrees" ? surface.focus : undefined;
      const scopeReview = reviewMindMapProposalScope(
        detail.artifact.currentRevision.content,
        focus,
        input.edits,
      );
      if (scopeReview.status === "outside_scope") {
        proposalScopeViolation(
          `Only use these selected node IDs: ${scopeReview.allowedNodeIds.join(
            ", ",
          )}. add_child.parentId and add_tree.parentId must be allowed, and move must not reorder an out-of-scope sibling. Correct the proposal input and retry within the remaining tool budget.`,
        );
      }
      return mindMapEditProposalToolOutputSchema.parse({
        artifactId: detail.id,
        baseRevisionId: detail.artifact.currentRevision.id,
        content: applyMindMapRefineEdits(detail.artifact.currentRevision.content, input.edits),
        edits: input.edits,
        kind: "mind_map",
        request: scope.latestUserMessage,
        runId: scope.rootRunId,
        summary: input.summary,
        title: detail.title,
      });
    },

    async createQuizProposal(
      scope: WorkspaceAgentToolContext,
      surface: ReadyArtifactSurface,
      input: QuizProposalInput,
    ) {
      if (!getQuizDetail) throw new Error("quiz_editing_unavailable");
      const detail = await getQuizDetail(scope.actor, {
        artifactId: surface.artifactId,
        conversationId: scope.conversationId,
        workspaceId: scope.workspaceId,
      });
      if (detail.generationState !== "ready") throw new Error("current_artifact_not_editable");
      if (detail.artifact.currentRevision.id !== surface.expectedRevisionId) {
        throw new Error("current_artifact_revision_conflict_refresh_required");
      }
      const focus = surface.focus?.kind === "quiz_questions" ? surface.focus : undefined;
      const scopeReview = reviewQuizProposalScope(focus, input.edits);
      if (scopeReview.status === "outside_scope") {
        proposalScopeViolation(
          `Only edit these selected question IDs: ${scopeReview.allowedQuestionIds.join(
            ", ",
          )}. Do not add questions or update Quiz settings. Correct the proposal input and retry within the remaining tool budget.`,
        );
      }
      return quizEditProposalToolOutputSchema.parse({
        artifactId: detail.id,
        baseRevisionId: detail.artifact.currentRevision.id,
        content: applyQuizRefineEdits(detail.artifact.currentRevision.content, input.edits),
        edits: input.edits,
        kind: "quiz",
        request: scope.latestUserMessage,
        runId: scope.rootRunId,
        summary: input.summary,
        title: detail.title,
      });
    },

    async createTeachingDocumentProposal(
      scope: WorkspaceAgentToolContext,
      surface: ReadyArtifactSurface,
      input: TeachingDocumentProposalInput,
    ) {
      const scopeReview = reviewTeachingDocumentProposalScope(
        surface.focus?.kind === "teaching_document_blocks" ? surface.focus : undefined,
        input.edits,
      );
      if (scopeReview.status === "outside_scope") {
        proposalScopeViolation(
          `Only edit these selected block handles: ${scopeReview.allowedBlockIds
            .map((id) => `[block:${id}]`)
            .join(
              ", ",
            )}. Do not update the title or target another block. Correct the proposal input and retry within the remaining tool budget.`,
        );
      }
      const detail = await dependencies.getTeachingDocumentDetail(scope.actor, {
        artifactId: surface.artifactId,
        conversationId: scope.conversationId,
        workspaceId: scope.workspaceId,
      });
      if (detail.generationState !== "ready") throw new Error("current_artifact_not_editable");
      if (detail.artifact.currentRevision.id !== surface.expectedRevisionId) {
        throw new Error("current_artifact_revision_conflict_refresh_required");
      }
      applyTeachingDocumentRefineEdits(detail.artifact.currentRevision.content, input.edits);
      return teachingDocumentEditProposalToolOutputSchema.parse({
        artifactId: detail.id,
        baseRevisionId: detail.artifact.currentRevision.id,
        edits: input.edits,
        kind: "teaching_document",
        request: scope.latestUserMessage,
        runId: scope.rootRunId,
        summary: input.summary,
        title: detail.title,
      });
    },

    async enqueuePresentationRefinement(
      scope: WorkspaceAgentToolContext,
      surface: ReadyArtifactSurface,
      input: PresentationRefinementInput,
    ) {
      if (!getPresentationDetail || !enqueuePresentationRefinement) {
        throw new Error("presentation_refinement_unavailable");
      }
      const detail = await getPresentationDetail(scope.actor, {
        artifactId: surface.artifactId,
        conversationId: scope.conversationId,
        workspaceId: scope.workspaceId,
      });
      if (detail.generationState !== "ready") throw new Error("current_artifact_not_editable");
      if (detail.artifact.currentRevision.id !== surface.expectedRevisionId) {
        throw new Error("current_artifact_revision_conflict_refresh_required");
      }
      const selectedIndexes =
        surface.focus?.kind === "presentation_slides" &&
        surface.focus.revisionId === surface.expectedRevisionId
          ? surface.focus.slideIndexes
          : Array.from(
              { length: detail.artifact.currentRevision.content.pageCount },
              (_, index) => index,
            );
      const focus = presentationRefinementFocusSchema.parse(
        selectedIndexes.map((index) => ({ index, path: `slide-${index + 1}` })),
      );
      await enqueuePresentationRefinement({
        actor: scope.actor,
        artifactId: detail.id,
        baseRevisionId: detail.artifact.currentRevision.id,
        conversationId: scope.conversationId,
        focus,
        instruction: input.instruction,
        runId: scope.rootRunId,
        workspaceId: scope.workspaceId,
      });
      return presentationRefinementQueuedToolOutputSchema.parse({
        artifactId: detail.id,
        baseRevisionId: detail.artifact.currentRevision.id,
        kind: "presentation",
        runId: scope.rootRunId,
        state: "queued",
        title: detail.title,
      });
    },

    async readCurrentArtifact(
      scope: WorkspaceAgentToolContext,
      surface: ArtifactDetailSurface,
      cursor: number,
    ) {
      if (surface.kind === "teaching_document") {
        const detail = await dependencies.getTeachingDocumentDetail(scope.actor, {
          artifactId: surface.artifactId,
          conversationId: scope.conversationId,
          workspaceId: scope.workspaceId,
        });
        const page =
          detail.generationState === "ready"
            ? (teachingDocumentMarkdownPageWithBlockIds(
                detail.artifact.currentRevision.content,
                cursor,
              ) ?? teachingDocumentMarkdownPage(detail.artifact.currentRevision.content, cursor))
            : null;
        return {
          contentMarkdown: page?.markdown ?? null,
          failureCode: detail.failureCode,
          generationState: detail.generationState,
          kind: detail.kind,
          nextCursor: page?.nextCursor ?? null,
          title: detail.title,
          updatedAt: detail.updatedAt,
        };
      }
      if (surface.kind === "mind_map") {
        if (!getMindMapDetail) throw new Error("mind_map_reading_unavailable");
        const detail = await getMindMapDetail(scope.actor, {
          artifactId: surface.artifactId,
          conversationId: scope.conversationId,
          workspaceId: scope.workspaceId,
        });
        const page =
          detail.generationState === "ready"
            ? mindMapMarkdownPage(detail.artifact.currentRevision.content, cursor, {
                includeNodeIds: true,
              })
            : null;
        return {
          contentMarkdown: page?.markdown ?? null,
          failureCode: detail.failureCode,
          generationState: detail.generationState,
          kind: detail.kind,
          nextCursor: page?.nextCursor ?? null,
          title: detail.title,
          updatedAt: detail.updatedAt,
        };
      }
      if (surface.kind === "quiz") {
        if (!getQuizDetail) throw new Error("quiz_reading_unavailable");
        const detail = await getQuizDetail(scope.actor, {
          artifactId: surface.artifactId,
          conversationId: scope.conversationId,
          workspaceId: scope.workspaceId,
        });
        const page =
          detail.generationState === "ready"
            ? quizMarkdownPage(detail.artifact.currentRevision.content, cursor)
            : null;
        return {
          contentMarkdown: page?.markdown ?? null,
          failureCode: detail.failureCode,
          generationState: detail.generationState,
          kind: detail.kind,
          nextCursor: page?.nextCursor ?? null,
          title: detail.title,
          updatedAt: detail.updatedAt,
        };
      }
      if (surface.kind === "game") {
        if (!getGameDetail) throw new Error("game_reading_unavailable");
        const detail = await getGameDetail(scope.actor, {
          artifactId: surface.artifactId,
          conversationId: scope.conversationId,
          workspaceId: scope.workspaceId,
        });
        const page =
          detail.generationState === "ready"
            ? gameMarkdownPage(detail.artifact.currentRevision.content, cursor)
            : null;
        return {
          contentMarkdown: page?.markdown ?? null,
          failureCode: detail.failureCode,
          generationState: detail.generationState,
          kind: detail.kind,
          nextCursor: page?.nextCursor ?? null,
          title: detail.title,
          updatedAt: detail.updatedAt,
        };
      }
      throw new Error("current_artifact_not_readable");
    },

    async readMindMap(scope: WorkspaceAgentToolContext, artifactId: string, cursor: number) {
      if (!getMindMapDetail) throw new Error("mind_map_reading_unavailable");
      let detail: Awaited<ReturnType<NonNullable<typeof getMindMapDetail>>>;
      try {
        detail = await getMindMapDetail(scope.actor, {
          artifactId,
          conversationId: scope.conversationId,
          workspaceId: scope.workspaceId,
        });
      } catch (error) {
        return inaccessibleArtifact(error);
      }
      const base = {
        artifactId: detail.id,
        generationState: detail.generationState,
        kind: detail.kind,
        title: detail.title,
        updatedAt: detail.updatedAt,
      };
      if (detail.generationState === "failed") {
        return {
          ...base,
          contentMarkdown: null,
          failureCode: detail.failureCode,
          generationState: "failed" as const,
          nextCursor: null,
        };
      }
      if (detail.generationState !== "ready") {
        return {
          ...base,
          contentMarkdown: null,
          failureCode: null,
          generationState: detail.generationState,
          nextCursor: null,
        };
      }
      const page = mindMapMarkdownPage(detail.artifact.currentRevision.content, cursor);
      return {
        ...base,
        contentMarkdown: page.markdown,
        failureCode: null,
        generationState: "ready" as const,
        nextCursor: page.nextCursor,
      };
    },

    async readTeachingDocument(
      scope: WorkspaceAgentToolContext,
      artifactId: string,
      cursor: number,
    ) {
      let detail: Awaited<ReturnType<typeof dependencies.getTeachingDocumentDetail>>;
      try {
        detail = await dependencies.getTeachingDocumentDetail(scope.actor, {
          artifactId,
          conversationId: scope.conversationId,
          workspaceId: scope.workspaceId,
        });
      } catch (error) {
        return inaccessibleArtifact(error);
      }
      if (detail.generationState === "failed") {
        return {
          artifactId: detail.id,
          contentMarkdown: null,
          failureCode: detail.failureCode,
          generationState: detail.generationState,
          kind: detail.kind,
          nextCursor: null,
          title: detail.title,
          updatedAt: detail.updatedAt,
        };
      }
      if (detail.generationState !== "ready") {
        return {
          artifactId: detail.id,
          contentMarkdown: null,
          failureCode: null,
          generationState: detail.generationState,
          kind: detail.kind,
          nextCursor: null,
          title: detail.title,
          updatedAt: detail.updatedAt,
        };
      }
      const page = teachingDocumentMarkdownPage(detail.artifact.currentRevision.content, cursor);
      return {
        artifactId: detail.id,
        contentMarkdown: page.markdown,
        failureCode: null,
        generationState: detail.generationState,
        kind: detail.kind,
        nextCursor: page.nextCursor,
        title: detail.title,
        updatedAt: detail.updatedAt,
      };
    },
  };
}
