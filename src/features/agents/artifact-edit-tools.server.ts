import "server-only";

import { createTool } from "@mastra/core/tools";
import type { z } from "zod";
import { operationGroundingReceiptFromBundle } from "@/features/artifacts/grounding";
import type { ArtifactEditProposal } from "@/features/artifacts/proposal-contract";
import type {
  ArtifactToolDependencies,
  artifactAgentComposition,
  createArtifactCommandAdapters,
} from "./artifact-composition.server";
import {
  applyCurrentGameEditsToolInputSchema,
  applyCurrentMindMapEditsToolInputSchema,
  applyCurrentQuizEditsToolInputSchema,
  currentArtifactUpdateToolOutputSchema,
  type MindMapEditProposal,
  mindMapEditProposalToolOutputSchema,
  presentationRefinementQueuedToolOutputSchema,
  proposeCurrentMindMapEditsToolInputSchema,
  proposeCurrentPresentationEditsToolInputSchema,
  proposeCurrentQuizEditsToolInputSchema,
  proposeCurrentTeachingDocumentEditsToolInputSchema,
  type QuizEditProposal,
  quizEditProposalToolOutputSchema,
  teachingDocumentEditProposalToolOutputSchema,
} from "./artifact-edit-tool-contract";
import { type ArtifactToolContext, artifactToolScope } from "./artifact-tool-context.server";
import { type InputBoundAttempt, runInputBoundOnce } from "./artifact-tool-idempotency.server";
import { ARTIFACT_AGENT_TOOL_IDS } from "./artifact-tool-protocol";
import {
  type WorkspaceAgentToolContext,
  workspaceAgentToolContextSchema,
} from "./workspace-agent-tool-context";

function updatedArtifactModelOutput(output: { kind: string; title: string }) {
  return {
    type: "text" as const,
    value: `Updated the current ${output.kind} titled "${output.title}". Do not mention internal identifiers.`,
  };
}

function teachingDocumentProposalModelOutput(
  output: z.infer<typeof teachingDocumentEditProposalToolOutputSchema>,
) {
  const proposal = teachingDocumentEditProposalToolOutputSchema.parse(output);
  return {
    type: "text" as const,
    value: `Prepared a reviewable proposal for the current teaching document "${proposal.title}": ${proposal.summary}. The document has not been saved or changed. Ask the user to review the inline proposal; do not repeat its full text.`,
  };
}

function mindMapProposalModelOutput(output: z.infer<typeof mindMapEditProposalToolOutputSchema>) {
  const proposal = mindMapEditProposalToolOutputSchema.parse(output);
  return {
    type: "text" as const,
    value: `Prepared a reviewable proposal for the current mind map "${proposal.title}": ${proposal.summary}. It has not been saved. Ask the user to review the inline proposal.`,
  };
}

function quizProposalModelOutput(output: z.infer<typeof quizEditProposalToolOutputSchema>) {
  const proposal = quizEditProposalToolOutputSchema.parse(output);
  return {
    type: "text" as const,
    value: `Prepared a reviewable proposal for the current Quiz "${proposal.title}": ${proposal.summary}. It has not been saved. Ask the user to review the inline proposal.`,
  };
}

function presentationRefinementModelOutput(
  output: z.infer<typeof presentationRefinementQueuedToolOutputSchema>,
) {
  const queued = presentationRefinementQueuedToolOutputSchema.parse(output);
  return {
    type: "text" as const,
    value: `Queued a reviewable refinement for the current presentation "${queued.title}". It has not been changed yet; ask the user to review the candidate when it appears.`,
  };
}

function currentReadySurface(
  scope: WorkspaceAgentToolContext,
  kind?: "mind_map" | "teaching_document" | "game" | "quiz" | "presentation",
) {
  const surface = scope.surface;
  if (
    surface.type !== "artifact_detail" ||
    surface.generationState !== "ready" ||
    !surface.expectedRevisionId ||
    (kind && surface.kind !== kind)
  ) {
    throw new Error("current_artifact_not_editable");
  }
  return { ...surface, expectedRevisionId: surface.expectedRevisionId };
}

export function createArtifactEditTools(input: {
  commandAdapters: ReturnType<typeof createArtifactCommandAdapters>;
  dependencies: ArtifactToolDependencies & typeof artifactAgentComposition;
}) {
  const { commandAdapters, dependencies } = input;
  const teachingDocumentProposals = new Map<
    string,
    InputBoundAttempt<{ output: z.infer<typeof teachingDocumentEditProposalToolOutputSchema> }>
  >();
  const mindMapProposals = new Map<string, InputBoundAttempt<{ output: MindMapEditProposal }>>();
  const quizProposals = new Map<string, InputBoundAttempt<{ output: QuizEditProposal }>>();
  const presentationRefinements = new Map<
    string,
    InputBoundAttempt<{ output: z.infer<typeof presentationRefinementQueuedToolOutputSchema> }>
  >();
  const mindMapUpdates = new Map<
    string,
    InputBoundAttempt<Awaited<ReturnType<typeof commandAdapters.applyMindMap>>>
  >();
  const quizUpdates = new Map<
    string,
    InputBoundAttempt<Awaited<ReturnType<typeof commandAdapters.applyQuiz>>>
  >();
  const gameUpdates = new Map<
    string,
    InputBoundAttempt<Awaited<ReturnType<typeof commandAdapters.applyGame>>>
  >();

  async function executeProposal<Output extends ArtifactEditProposal>(proposalInput: {
    attempts: Map<string, InputBoundAttempt<{ output: Output }>>;
    conflictCode: string;
    context: ArtifactToolContext | undefined;
    create: () => Promise<Output>;
    eventType: `data-${string}`;
    groundingRefs: string[];
    key: string;
    request: unknown;
    scope: WorkspaceAgentToolContext;
  }) {
    const output = await proposalInput.create();
    const grounding = await dependencies.resolveGroundingRefs({
      refs: proposalInput.groundingRefs,
      scope: proposalInput.scope,
      ...(proposalInput.context?.requestContext
        ? { requestContext: proposalInput.context.requestContext }
        : {}),
      ...(proposalInput.context?.tracingContext
        ? { tracingContext: proposalInput.context.tracingContext }
        : {}),
    });
    const { detail, first } = await runInputBoundOnce(
      proposalInput.attempts,
      proposalInput.key,
      proposalInput.request,
      proposalInput.conflictCode,
      async () => {
        await dependencies.publishProposal(proposalInput.scope.actor, {
          artifactId: output.artifactId,
          conversationId: proposalInput.scope.conversationId,
          groundingReceipt: operationGroundingReceiptFromBundle(grounding),
          proposal: output,
          workspaceId: proposalInput.scope.workspaceId,
        });
        return { output };
      },
    );
    if (first) {
      await proposalInput.context?.writer?.custom({
        data: detail.output,
        type: proposalInput.eventType,
      });
    }
    return detail.output;
  }

  const proposeCurrentTeachingDocumentEdits = createTool({
    id: ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits,
    description:
      "Propose reviewable block-level edits to the ready teaching document currently open in the workbench. Use trusted [block:...] handles from the validated selection or from a successful read_current_artifact call. For a handle [block:abc], pass blockId as exactly abc without the block: prefix. A selection-scoped request should call this tool directly without reading the artifact. Read first only when broader content or unavailable block handles are needed; update_title uses the current page title and needs no block handle. This tool never saves the document; the user must accept the inline proposal.",
    inputSchema: proposeCurrentTeachingDocumentEditsToolInputSchema,
    outputSchema: teachingDocumentEditProposalToolOutputSchema,
    requestContextSchema: workspaceAgentToolContextSchema,
    strict: true,
    execute: async ({ edits, groundingRefs, summary }, context) => {
      const scope = artifactToolScope(context);
      const surface = currentReadySurface(scope, "teaching_document");
      const key = `${scope.rootRunId}:${surface.artifactId}:${ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits}`;
      return executeProposal({
        attempts: teachingDocumentProposals,
        conflictCode: "teaching_document_proposal_already_created_this_run",
        context,
        create: () =>
          commandAdapters.createTeachingDocumentProposal(scope, surface, {
            edits,
            groundingRefs,
            summary,
          }),
        eventType: "data-teachingDocumentEditProposed",
        groundingRefs,
        key,
        request: { edits, groundingRefs, summary },
        scope,
      });
    },
    toModelOutput: teachingDocumentProposalModelOutput,
  });

  const proposeCurrentMindMapEdits = createTool({
    id: ARTIFACT_AGENT_TOOL_IDS.proposeCurrentMindMapEdits,
    description:
      "Propose one complete, reviewable structural revision to the ready mind map currently open. For every addition, use one add_tree edit per selected existing parent: parentId is the existing anchor; levels is the exact number of new levels requested by the user; nodes contains every new node; key is a proposal-local name; and parentKey is null for a direct child or another new node's key for a descendant. Every branch must reach levels. Include all requested levels in this single proposal; never submit a partial first layer, split work across acceptance steps, or promise to continue after acceptance. When a selected subtree is provided, use only its supplied node IDs and do not read the full artifact. The map changes only after user acceptance.",
    inputSchema: proposeCurrentMindMapEditsToolInputSchema,
    outputSchema: mindMapEditProposalToolOutputSchema,
    requestContextSchema: workspaceAgentToolContextSchema,
    strict: true,
    execute: async ({ edits, groundingRefs, summary }, context) => {
      const scope = artifactToolScope(context);
      const surface = currentReadySurface(scope, "mind_map");
      const key = `${scope.rootRunId}:${surface.artifactId}:${ARTIFACT_AGENT_TOOL_IDS.proposeCurrentMindMapEdits}`;
      return executeProposal({
        attempts: mindMapProposals,
        conflictCode: "mind_map_proposal_already_created_this_run",
        context,
        create: () =>
          commandAdapters.createMindMapProposal(scope, surface, {
            edits,
            groundingRefs,
            summary,
          }),
        eventType: "data-mindMapEditProposed",
        groundingRefs,
        key,
        request: { edits, groundingRefs, summary },
        scope,
      });
    },
    toModelOutput: mindMapProposalModelOutput,
  });

  const proposeCurrentQuizEdits = createTool({
    id: ARTIFACT_AGENT_TOOL_IDS.proposeCurrentQuizEdits,
    description:
      "Propose reviewable edits to the ready Quiz currently open. Whenever the latest user message explicitly requests a Quiz change, you must call this tool instead of replying with replacement text only. When selected question context is provided, edit, copy, delete, or move only those question IDs; do not add a question or change Quiz settings, and do not read the full artifact. The Quiz changes only after user acceptance.",
    inputSchema: proposeCurrentQuizEditsToolInputSchema,
    outputSchema: quizEditProposalToolOutputSchema,
    requestContextSchema: workspaceAgentToolContextSchema,
    strict: true,
    execute: async ({ edits, groundingRefs, summary }, context) => {
      const scope = artifactToolScope(context);
      const surface = currentReadySurface(scope, "quiz");
      const key = `${scope.rootRunId}:${surface.artifactId}:${ARTIFACT_AGENT_TOOL_IDS.proposeCurrentQuizEdits}`;
      return executeProposal({
        attempts: quizProposals,
        conflictCode: "quiz_proposal_already_created_this_run",
        context,
        create: () =>
          commandAdapters.createQuizProposal(scope, surface, {
            edits,
            groundingRefs,
            summary,
          }),
        eventType: "data-quizEditProposed",
        groundingRefs,
        key,
        request: { edits, groundingRefs, summary },
        scope,
      });
    },
    toModelOutput: quizProposalModelOutput,
  });

  const proposeCurrentPresentationEdits = createTool({
    id: ARTIFACT_AGENT_TOOL_IDS.proposeCurrentPresentationEdits,
    description:
      "Queue a reviewable refinement of the ready presentation currently open in the workbench. Use this when the user asks to change the presentation. Keep the instruction precise; the existing authoring session will produce one candidate in the current workspace. The presentation is not changed until the user accepts the candidate.",
    inputSchema: proposeCurrentPresentationEditsToolInputSchema,
    outputSchema: presentationRefinementQueuedToolOutputSchema,
    requestContextSchema: workspaceAgentToolContextSchema,
    strict: true,
    execute: async (input, context) => {
      const scope = artifactToolScope(context);
      const surface = currentReadySurface(scope, "presentation");
      const key = `${scope.rootRunId}:${surface.artifactId}:${ARTIFACT_AGENT_TOOL_IDS.proposeCurrentPresentationEdits}`;
      const { detail, first } = await runInputBoundOnce(
        presentationRefinements,
        key,
        input,
        "presentation_refinement_already_queued_this_run",
        async () => ({
          output: await commandAdapters.enqueuePresentationRefinement(scope, surface, input),
        }),
      );
      if (first) {
        await context?.writer?.custom({
          data: detail.output,
          type: "data-presentationRefinementQueued",
        });
      }
      return detail.output;
    },
    toModelOutput: presentationRefinementModelOutput,
  });

  const applyCurrentMindMapEdits = createTool({
    id: ARTIFACT_AGENT_TOOL_IDS.applyCurrentMindMapEdits,
    description:
      "Apply explicit structural edits to the mind map currently open in the workbench. Node IDs must come from read_current_artifact; new node IDs are generated by the server. Multi-level additions use one flat add_tree edit.",
    inputSchema: applyCurrentMindMapEditsToolInputSchema,
    outputSchema: currentArtifactUpdateToolOutputSchema,
    requestContextSchema: workspaceAgentToolContextSchema,
    strict: true,
    execute: async ({ edits }, context) => {
      const scope = artifactToolScope(context);
      const surface = currentReadySurface(scope, "mind_map");
      const key = `${scope.rootRunId}:${surface.artifactId}:${ARTIFACT_AGENT_TOOL_IDS.applyCurrentMindMapEdits}`;
      const { detail: attempt, first } = await runInputBoundOnce(
        mindMapUpdates,
        key,
        { edits },
        "current_artifact_already_modified_this_run",
        () => commandAdapters.applyMindMap(scope, surface, { edits }),
      );
      if (first) {
        await context?.writer?.custom({ data: attempt.eventData, type: "data-artifactStarted" });
      }
      return attempt.output;
    },
    toModelOutput: updatedArtifactModelOutput,
  });

  const applyCurrentQuizEdits = createTool({
    id: ARTIFACT_AGENT_TOOL_IDS.applyCurrentQuizEdits,
    description:
      "Apply explicit structural edits to the ready Quiz currently open in the workbench. Question IDs must come from read_current_artifact; the server creates all new stable IDs.",
    inputSchema: applyCurrentQuizEditsToolInputSchema,
    outputSchema: currentArtifactUpdateToolOutputSchema,
    requestContextSchema: workspaceAgentToolContextSchema,
    strict: true,
    execute: async ({ edits }, context) => {
      const scope = artifactToolScope(context);
      const surface = currentReadySurface(scope, "quiz");
      const key = `${scope.rootRunId}:${surface.artifactId}:${ARTIFACT_AGENT_TOOL_IDS.applyCurrentQuizEdits}`;
      const { detail: attempt, first } = await runInputBoundOnce(
        quizUpdates,
        key,
        { edits },
        "current_artifact_already_modified_this_run",
        () => commandAdapters.applyQuiz(scope, surface, { edits }),
      );
      if (first) {
        await context?.writer?.custom({ data: attempt.eventData, type: "data-artifactStarted" });
      }
      return attempt.output;
    },
    toModelOutput: updatedArtifactModelOutput,
  });

  const applyCurrentGameEdits = createTool({
    id: ARTIFACT_AGENT_TOOL_IDS.applyCurrentGameEdits,
    description:
      "Apply explicit question-bank edits to the ready Flap Revival game currently open. Read the current game first when question IDs or existing wording are needed. Game questions may only be single-choice or true/false and are always worth one point; the server creates stable IDs for new questions. When the user asks to add questions without specifying a count, add exactly three; when a count is specified, add that many. This updates the game immediately and does not create a proposal.",
    inputSchema: applyCurrentGameEditsToolInputSchema,
    outputSchema: currentArtifactUpdateToolOutputSchema,
    requestContextSchema: workspaceAgentToolContextSchema,
    strict: true,
    execute: async ({ edits }, context) => {
      const scope = artifactToolScope(context);
      const surface = currentReadySurface(scope, "game");
      const key = `${scope.rootRunId}:${surface.artifactId}:${ARTIFACT_AGENT_TOOL_IDS.applyCurrentGameEdits}`;
      const { detail: attempt, first } = await runInputBoundOnce(
        gameUpdates,
        key,
        { edits },
        "current_artifact_already_modified_this_run",
        () => commandAdapters.applyGame(scope, surface, { edits }),
      );
      if (first) {
        await context?.writer?.custom({ data: attempt.eventData, type: "data-artifactStarted" });
      }
      return attempt.output;
    },
    toModelOutput: updatedArtifactModelOutput,
  });

  return {
    [applyCurrentGameEdits.id]: applyCurrentGameEdits,
    [applyCurrentMindMapEdits.id]: applyCurrentMindMapEdits,
    [applyCurrentQuizEdits.id]: applyCurrentQuizEdits,
    [proposeCurrentMindMapEdits.id]: proposeCurrentMindMapEdits,
    [proposeCurrentPresentationEdits.id]: proposeCurrentPresentationEdits,
    [proposeCurrentQuizEdits.id]: proposeCurrentQuizEdits,
    [proposeCurrentTeachingDocumentEdits.id]: proposeCurrentTeachingDocumentEdits,
  };
}
