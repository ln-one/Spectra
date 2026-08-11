import "server-only";

import type { ProcessInputStepArgs } from "@mastra/core/processors";
import type { UIMessage } from "ai";
import {
  createArtifactsToolInputSchema,
  createArtifactsToolOutputSchema,
  type PreviousArtifactCreationPlan,
  previousArtifactCreationPlanFromRequests,
} from "./artifact-create-tool-contract";
import {
  currentArtifactUpdateToolOutputSchema,
  mindMapEditProposalToolOutputSchema,
  presentationRefinementQueuedToolOutputSchema,
  quizEditProposalToolOutputSchema,
  teachingDocumentEditProposalToolOutputSchema,
} from "./artifact-edit-tool-contract";
import { commitArtifactPlanToolOutputSchema } from "./artifact-plan-contract";
import { ARTIFACT_AGENT_TOOL_IDS } from "./artifact-tool-protocol";
import { workspaceAgentProfile } from "./config";
import {
  synchronizeWorkspaceToolCallBudget,
  WORKSPACE_VISUAL_CONTEXT_PREFIX,
  workspaceKnowledgeVisualModelMessageForRequestContext,
} from "./knowledge-tool.server";
import {
  PLANNING_TOOL_IDS,
  parsePlanningQuestionBatch,
  workspacePlanSchema,
} from "./planning-tools";

const ARTIFACT_MUTATION_TOOL_IDS = new Set<string>([
  ARTIFACT_AGENT_TOOL_IDS.applyCurrentGameEdits,
  ARTIFACT_AGENT_TOOL_IDS.applyCurrentMindMapEdits,
  ARTIFACT_AGENT_TOOL_IDS.applyCurrentQuizEdits,
  ARTIFACT_AGENT_TOOL_IDS.commitArtifactPlan,
  ARTIFACT_AGENT_TOOL_IDS.createArtifacts,
  ARTIFACT_AGENT_TOOL_IDS.proposeCurrentMindMapEdits,
  ARTIFACT_AGENT_TOOL_IDS.proposeCurrentPresentationEdits,
  ARTIFACT_AGENT_TOOL_IDS.proposeCurrentQuizEdits,
  ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits,
  ARTIFACT_AGENT_TOOL_IDS.updateCurrentTeachingDocument,
]);

function messageText(message: UIMessage) {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
}

function toolPartName(part: UIMessage["parts"][number]) {
  if (part.type === "dynamic-tool") return part.toolName;
  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
}

function artifactActionReceipt(message: UIMessage) {
  const receipts: string[] = [];
  let hasMutation = false;
  for (const part of message.parts) {
    const toolName = toolPartName(part);
    if (!toolName || !ARTIFACT_MUTATION_TOOL_IDS.has(toolName)) continue;
    const output = Reflect.get(part, "output");
    if (toolName === ARTIFACT_AGENT_TOOL_IDS.createArtifacts) {
      hasMutation = true;
      const parsed = createArtifactsToolOutputSchema.safeParse(output);
      if (parsed.success) {
        receipts.push(
          ...parsed.data.artifacts.map(
            (artifact) =>
              `created ${artifact.kind} "${artifact.title}" (${artifact.generationState})`,
          ),
          ...parsed.data.failedKinds.map((kind) => `failed to create ${kind}`),
        );
      }
      continue;
    }
    if (toolName === ARTIFACT_AGENT_TOOL_IDS.commitArtifactPlan) {
      const parsed = commitArtifactPlanToolOutputSchema.safeParse(output);
      if (parsed.success) {
        hasMutation = true;
        receipts.push(
          ...parsed.data.results.map((result) =>
            result.status === "started"
              ? `started ${result.artifact.kind} "${result.artifact.title}" (${result.artifact.generationState})`
              : `failed to start ${result.kind}`,
          ),
        );
      }
      continue;
    }
    if (
      toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits ||
      toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentMindMapEdits ||
      toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentQuizEdits ||
      toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentPresentationEdits
    ) {
      if (toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentPresentationEdits) {
        const parsed = presentationRefinementQueuedToolOutputSchema.safeParse(output);
        if (parsed.success) {
          hasMutation = true;
          receipts.push(`queued edits to presentation "${parsed.data.title}"`);
        }
        continue;
      }
      const schema =
        toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits
          ? teachingDocumentEditProposalToolOutputSchema
          : toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentMindMapEdits
            ? mindMapEditProposalToolOutputSchema
            : quizEditProposalToolOutputSchema;
      const parsed = schema.safeParse(output);
      if (parsed.success) {
        hasMutation = true;
        receipts.push(`proposed edits to ${parsed.data.kind} "${parsed.data.title}"`);
      }
      continue;
    }
    hasMutation = true;
    const parsed = currentArtifactUpdateToolOutputSchema.safeParse(output);
    if (parsed.success) receipts.push(`updated ${parsed.data.kind} "${parsed.data.title}"`);
  }
  if (!hasMutation) return null;
  return receipts.length > 0
    ? `Previous artifact action: ${receipts.join("; ")}.`
    : "Previous artifact action did not complete successfully.";
}

function planningActionContext(message: UIMessage) {
  const contexts: string[] = [];
  for (const part of message.parts) {
    const toolName = toolPartName(part);
    const input = Reflect.get(part, "input");
    if (toolName === PLANNING_TOOL_IDS.askUser) {
      const batch = parsePlanningQuestionBatch(input);
      if (batch) {
        contexts.push(
          `Planning questions asked:\n${batch.questions
            .map((question, index) => `${index + 1}. ${question.question}`)
            .join("\n")}`,
        );
      }
      continue;
    }
    if (toolName === PLANNING_TOOL_IDS.submitPlan) {
      const plan = workspacePlanSchema.safeParse(input);
      if (plan.success) {
        contexts.push(
          [
            "Planning proposal submitted:",
            `# ${plan.data.title}`,
            plan.data.summary,
            ...plan.data.sections.map((section) => `## ${section.title}\n${section.body}`),
          ].join("\n\n"),
        );
      }
    }
  }
  return contexts.join("\n\n");
}

function conversationTurns(messages: readonly UIMessage[]) {
  const turns: UIMessage[][] = [];
  let current: UIMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      if (current.length > 0) turns.push(current);
      current = [message];
    } else if (current.length > 0 && message.role === "assistant") {
      current.push(message);
    }
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

export function modelConversationMessages(
  messages: readonly UIMessage[],
  maxTurns = workspaceAgentProfile.modelContextLastTurns,
): UIMessage[] {
  return conversationTurns(messages)
    .slice(-maxTurns)
    .flatMap((turn) =>
      turn.flatMap((message) => {
        const text =
          message.role === "assistant"
            ? (artifactActionReceipt(message) ??
              [messageText(message), planningActionContext(message)].filter(Boolean).join("\n\n"))
            : messageText(message);
        if (!text) return [];
        return [{ id: message.id, parts: [{ text, type: "text" as const }], role: message.role }];
      }),
    );
}

export function previousArtifactCreationPlan(messages: readonly UIMessage[]) {
  const turns = conversationTurns(messages);
  let resolvedPlan: PreviousArtifactCreationPlan | undefined;
  for (const turn of turns) {
    const creationParts = turn.flatMap((message) =>
      message.parts.filter((part) => {
        const toolName = toolPartName(part);
        return toolName === ARTIFACT_AGENT_TOOL_IDS.createArtifacts;
      }),
    );
    if (creationParts.length === 0) continue;
    const user = turn.find((message) => message.role === "user");
    const text = user ? messageText(user) : "";
    if (!text) {
      resolvedPlan = undefined;
      continue;
    }
    const unifiedSuccess = creationParts.find((part) => {
      return (
        toolPartName(part) === ARTIFACT_AGENT_TOOL_IDS.createArtifacts &&
        createArtifactsToolOutputSchema.safeParse(Reflect.get(part, "output")).success
      );
    });
    if (unifiedSuccess) {
      const input = createArtifactsToolInputSchema.safeParse(Reflect.get(unifiedSuccess, "input"));
      if (!input.success) {
        resolvedPlan = undefined;
        continue;
      }
      resolvedPlan = previousArtifactCreationPlanFromRequests(input.data.requests);
      continue;
    }
    resolvedPlan = undefined;
  }
  return resolvedPlan;
}

function latestUserContinuation<T extends { role: string }>(messages: readonly T[]) {
  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }
  return latestUserIndex >= 0 ? messages.slice(latestUserIndex) : undefined;
}

function completedArtifactMutationInMessages(messages: readonly { role: string }[]) {
  for (const message of messages) {
    const content = Reflect.get(message, "content");
    if (!content || typeof content !== "object") continue;
    const parts = Reflect.get(content, "parts");
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const invocation = Reflect.get(part, "toolInvocation");
      if (!invocation || typeof invocation !== "object") continue;
      const toolName = Reflect.get(invocation, "toolName");
      if (typeof toolName !== "string" || !ARTIFACT_MUTATION_TOOL_IDS.has(toolName)) continue;
      if (Reflect.get(invocation, "state") !== "result") continue;
      if (toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits) {
        if (
          teachingDocumentEditProposalToolOutputSchema.safeParse(Reflect.get(invocation, "result"))
            .success
        ) {
          return true;
        }
        continue;
      }
      if (toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentMindMapEdits) {
        if (
          mindMapEditProposalToolOutputSchema.safeParse(Reflect.get(invocation, "result")).success
        ) {
          return true;
        }
        continue;
      }
      if (toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentQuizEdits) {
        if (quizEditProposalToolOutputSchema.safeParse(Reflect.get(invocation, "result")).success) {
          return true;
        }
        continue;
      }
      if (toolName === ARTIFACT_AGENT_TOOL_IDS.proposeCurrentPresentationEdits) {
        if (
          presentationRefinementQueuedToolOutputSchema.safeParse(Reflect.get(invocation, "result"))
            .success
        ) {
          return true;
        }
        continue;
      }
      return true;
    }
  }
  return false;
}

function isolateArtifactMutationContinuation({
  messages,
  steps,
}: Pick<ProcessInputStepArgs, "messages" | "steps">) {
  const mutated =
    completedArtifactMutationInMessages(messages) ||
    steps.some((step) => {
      const toolCalls = Reflect.get(step, "toolCalls");
      const toolResults = Reflect.get(step, "toolResults");
      const mutationNames = [
        ...(Array.isArray(toolCalls) ? toolCalls : []),
        ...(Array.isArray(toolResults) ? toolResults : []),
      ].flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const candidate = Reflect.get(entry, "toolName") ?? Reflect.get(entry, "name");
        return typeof candidate === "string" && ARTIFACT_MUTATION_TOOL_IDS.has(candidate)
          ? [candidate]
          : [];
      });
      const proposalNames = new Set<string>([
        ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits,
        ARTIFACT_AGENT_TOOL_IDS.proposeCurrentMindMapEdits,
        ARTIFACT_AGENT_TOOL_IDS.proposeCurrentPresentationEdits,
        ARTIFACT_AGENT_TOOL_IDS.proposeCurrentQuizEdits,
      ]);
      if (mutationNames.some((name) => !proposalNames.has(name))) {
        return true;
      }
      const calledProposalNames = mutationNames.filter((name) => proposalNames.has(name));
      if (calledProposalNames.length === 0) return false;
      if (!Array.isArray(toolResults)) return false;
      const proposalResults = toolResults.filter(
        (result) =>
          result &&
          typeof result === "object" &&
          calledProposalNames.includes(String(Reflect.get(result, "toolName"))),
      );
      if (proposalResults.length === 0) return false;
      return proposalResults.some((result) => {
        const output = Reflect.has(result, "result")
          ? Reflect.get(result, "result")
          : Reflect.get(result, "output");
        return (
          teachingDocumentEditProposalToolOutputSchema.safeParse(output).success ||
          mindMapEditProposalToolOutputSchema.safeParse(output).success ||
          presentationRefinementQueuedToolOutputSchema.safeParse(output).success ||
          quizEditProposalToolOutputSchema.safeParse(output).success
        );
      });
    });
  if (!mutated) return undefined;
  const latestUserMessages = latestUserContinuation(messages);
  return latestUserMessages
    ? { activeTools: [], messages: latestUserMessages, toolChoice: "none" as const }
    : undefined;
}

export function prepareWorkspaceAgentStep({
  messageList,
  messages,
  requestContext,
  steps,
}: Pick<ProcessInputStepArgs, "messageList" | "messages" | "requestContext" | "steps">) {
  const toolCallCount = steps.reduce((count, step) => {
    const toolCalls = Reflect.get(step, "toolCalls");
    return count + (Array.isArray(toolCalls) ? toolCalls.length : 0);
  }, 0);
  synchronizeWorkspaceToolCallBudget(requestContext, toolCallCount);
  const mutationContinuation = isolateArtifactMutationContinuation({ messages, steps });
  if (mutationContinuation) return mutationContinuation;
  const visualMessage = workspaceKnowledgeVisualModelMessageForRequestContext(requestContext);
  if (visualMessage) {
    const previousVisualMessageIds = messages.flatMap((message) =>
      message.content.parts.some(
        (part) => part.type === "text" && part.text.startsWith(WORKSPACE_VISUAL_CONTEXT_PREFIX),
      )
        ? [message.id]
        : [],
    );
    if (previousVisualMessageIds.length > 0) messageList.removeByIds(previousVisualMessageIds);
    messageList.add(visualMessage, "context");
  }
  if (toolCallCount < workspaceAgentProfile.budget.maxToolCalls) {
    return visualMessage ? { messageList } : undefined;
  }
  return {
    activeTools: [],
    ...(visualMessage ? { messageList } : {}),
    toolChoice: "none" as const,
  };
}
