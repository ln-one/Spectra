import "server-only";

import { toAISdkStream } from "@mastra/ai-sdk";
import type { RequestContext } from "@mastra/core/request-context";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { createUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { threadTitleProfile, workspaceAgentProfile } from "@/features/agents/config";
import { clearAiConversationActiveStream } from "@/features/agents/conversation-records";
import { KNOWLEDGE_EVIDENCE_DATA_PART } from "@/features/agents/knowledge-citation-contract";
import {
  knowledgeIterationControl,
  workspaceKnowledgeEvidenceDataForRequestContext,
} from "@/features/agents/knowledge-tool.server";
import { assistantMessageHasUserVisibleOutput } from "@/features/agents/message-output";
import { appendAssistantToMessageSnapshot } from "@/features/agents/message-records";
import { PLANNING_TOOL_IDS } from "@/features/agents/planning-tools";
import {
  registerAiRunCancellation,
  unregisterAiRunCancellation,
} from "@/features/agents/run-cancellation";
import {
  completeAiRunAudit,
  finishAiRun,
  settleAiRunAttempt,
  startAiRunAttempt,
} from "@/features/agents/runs";
import type { workspaceAgentComposition } from "@/features/agents/server";
import { generateThreadTitle } from "@/features/agents/threads";
import type { WorkspaceAgentToolContext } from "@/features/agents/workspace-agent-tool-context";
import { prepareWorkspaceAgentStep } from "@/features/agents/workspace-agent-turn-policy";
import type { Workspace } from "@/features/workspaces/types";
import { webLogger } from "@/observability/server";
import { applicationTracer } from "@/observability/tracing.server";

type WorkspaceAgent = ReturnType<typeof workspaceAgentComposition>["agent"];

function hasPlanningToolCall(message: UIMessage) {
  return message.parts.some((part) => {
    const toolName =
      part.type === `tool-${PLANNING_TOOL_IDS.askUser}`
        ? PLANNING_TOOL_IDS.askUser
        : part.type === `tool-${PLANNING_TOOL_IDS.submitPlan}`
          ? PLANNING_TOOL_IDS.submitPlan
          : Reflect.get(part, "toolName");
    return toolName === PLANNING_TOOL_IDS.askUser || toolName === PLANNING_TOOL_IDS.submitPlan;
  });
}

export type WorkspaceAgentExecutionResult =
  | { code: string; runId: string; status: number; type: "error" }
  | {
      headers: Record<string, string>;
      stream: ReadableStream<UIMessageChunk>;
      type: "stream";
    };

class AgentOutputUnavailableError extends Error {
  constructor() {
    super("agent_output_unavailable");
    this.name = "AgentOutputUnavailableError";
  }
}

function abortClassification(
  timeoutSignal: AbortSignal,
  cancellationSignal: AbortSignal,
  error: unknown,
) {
  if (cancellationSignal.aborted) {
    return {
      abortReason: "user_abort_requested",
      attemptErrorCode: "user_abort_requested",
      failureCode: null,
      state: "cancelled" as const,
    };
  }
  if (error instanceof AgentOutputUnavailableError) {
    return {
      abortReason: null,
      attemptErrorCode: error.message,
      failureCode: error.message,
      state: "failed" as const,
    };
  }
  if (timeoutSignal.aborted) {
    return {
      abortReason: "timeout",
      attemptErrorCode: "agent_timeout",
      failureCode: "agent_timeout",
      state: "interrupted" as const,
    };
  }
  if (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && /abort/i.test(error.name))
  ) {
    return {
      abortReason: "provider_aborted",
      attemptErrorCode: "agent_provider_aborted",
      failureCode: "agent_provider_aborted",
      state: "interrupted" as const,
    };
  }
  return {
    abortReason: null,
    attemptErrorCode: "agent_unavailable",
    failureCode: "agent_unavailable",
    state: "failed" as const,
  };
}

export function logWorkspaceAgentFailure(
  label: string,
  error: unknown,
  contextFields: {
    attemptId?: string;
    conversationId?: string;
    durationMs?: number;
    event?: string;
    failureCode?: string;
    runId?: string;
    workspaceId?: string;
  } = {},
) {
  webLogger.error(
    {
      component: "agent",
      ...contextFields,
      error,
      event: contextFields.event ?? "agent.run.failed",
    },
    label,
  );
}

export async function executeWorkspaceAgent(input: {
  agent: WorkspaceAgent;
  conversationId: string;
  createdByPrincipalId: string;
  effectiveText: string;
  messages: UIMessage[];
  requestContext: RequestContext<WorkspaceAgentToolContext>;
  run: { id: string };
  shouldGenerateTitle: boolean;
  timeoutSignal?: AbortSignal;
  workspace: Workspace;
}): Promise<WorkspaceAgentExecutionResult> {
  const startedAt = Date.now();
  const cancellationController = registerAiRunCancellation(input.run.id);
  let attempt: Awaited<ReturnType<typeof startAiRunAttempt>>;
  try {
    attempt = await startAiRunAttempt({
      modelId: workspaceAgentProfile.modelId,
      profileSnapshot: workspaceAgentProfile,
      purpose: "workspace_agent",
      runId: input.run.id,
    });
  } catch (error) {
    unregisterAiRunCancellation(input.run.id, cancellationController);
    throw error;
  }
  if (!attempt) {
    unregisterAiRunCancellation(input.run.id, cancellationController);
    await finishAiRun({
      failureCode: "agent_budget_exhausted",
      runId: input.run.id,
      state: "failed",
    });
    return {
      code: "agent_budget_exhausted",
      runId: input.run.id,
      status: 429,
      type: "error",
    };
  }

  const runSpan = applicationTracer.startSpan("agent.workspace.run", {
    attributes: {
      "gen_ai.operation.name": "invoke_agent",
      "gen_ai.provider.name": "dashscope",
      "gen_ai.request.model": workspaceAgentProfile.modelId,
      "spectra.attempt.id": attempt.id,
      "spectra.conversation.id": input.conversationId,
      "spectra.run.id": input.run.id,
      "spectra.workspace.id": input.workspace.id,
    },
  });
  const runSpanContext = trace.setSpan(context.active(), runSpan);
  webLogger.info(
    {
      attemptId: attempt.id,
      component: "agent",
      conversationId: input.conversationId,
      event: "agent.run.started",
      runId: input.run.id,
      workspaceId: input.workspace.id,
    },
    "Workspace agent run started",
  );
  let runSpanEnded = false;
  const endRunSpan = (fields: {
    durationMs: number;
    failureCode?: string;
    finishReason?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  }) => {
    if (runSpanEnded) return;
    runSpanEnded = true;
    runSpan.setAttribute("spectra.duration_ms", fields.durationMs);
    if (fields.failureCode) {
      runSpan.setAttribute("spectra.failure.code", fields.failureCode);
      runSpan.setStatus({ code: SpanStatusCode.ERROR, message: fields.failureCode });
    } else {
      runSpan.setStatus({ code: SpanStatusCode.OK });
    }
    if (fields.finishReason) {
      runSpan.setAttribute("gen_ai.response.finish_reasons", [fields.finishReason]);
    }
    if (fields.inputTokens) runSpan.setAttribute("gen_ai.usage.input_tokens", fields.inputTokens);
    if (fields.outputTokens)
      runSpan.setAttribute("gen_ai.usage.output_tokens", fields.outputTokens);
    if (fields.totalTokens) runSpan.setAttribute("spectra.usage.total_tokens", fields.totalTokens);
    runSpan.end();
  };
  const timeoutSignal =
    input.timeoutSignal ?? AbortSignal.timeout(workspaceAgentProfile.budget.wallTimeMs);
  const executionSignal = AbortSignal.any([timeoutSignal, cancellationController.signal]);

  let output: Awaited<ReturnType<WorkspaceAgent["stream"]>>;
  try {
    output = await context.with(runSpanContext, () =>
      input.agent.stream(input.messages, {
        abortSignal: executionSignal,
        maxSteps: workspaceAgentProfile.maxSteps,
        onIterationComplete: (iteration) =>
          iteration.toolCalls.some(
            (toolCall) =>
              toolCall.name === PLANNING_TOOL_IDS.askUser ||
              toolCall.name === PLANNING_TOOL_IDS.submitPlan,
          )
            ? { continue: false }
            : knowledgeIterationControl(iteration),
        modelSettings: {
          maxOutputTokens: workspaceAgentProfile.maxOutputTokens,
          temperature: workspaceAgentProfile.temperature,
        },
        prepareStep: prepareWorkspaceAgentStep,
        providerOptions: workspaceAgentProfile.providerOptions,
        requestContext: input.requestContext,
        runId: input.run.id,
        toolCallConcurrency: 1,
      }),
    );
  } catch (error) {
    const classification = abortClassification(timeoutSignal, cancellationController.signal, error);
    endRunSpan({
      durationMs: Date.now() - startedAt,
      ...(classification.failureCode ? { failureCode: classification.failureCode } : {}),
    });
    logWorkspaceAgentFailure("Workspace agent failed before streaming", error, {
      attemptId: attempt.id,
      conversationId: input.conversationId,
      failureCode: classification.attemptErrorCode,
      runId: input.run.id,
      workspaceId: input.workspace.id,
    });
    await settleAiRunAttempt({
      attemptId: attempt.id,
      errorCode: classification.attemptErrorCode,
      state: classification.state,
    });
    await finishAiRun({
      abortReason: classification.abortReason,
      failureCode: classification.failureCode,
      runId: input.run.id,
      state: classification.state,
    });
    unregisterAiRunCancellation(input.run.id, cancellationController);
    throw error;
  }

  const assistantMessageId = `assistant:${input.run.id}`;
  let executionSucceeded = false;
  const stream = createUIMessageStream<UIMessage>({
    execute: context.bind(runSpanContext, async ({ writer }) => {
      try {
        writer.merge(
          toAISdkStream(output, {
            from: "agent",
            onError: (error) => {
              logWorkspaceAgentFailure("Workspace agent output conversion failed", error, {
                attemptId: attempt.id,
                conversationId: input.conversationId,
                event: "agent.output_conversion.failed",
                runId: input.run.id,
                workspaceId: input.workspace.id,
              });
              return "agent_unavailable";
            },
            sendReasoning: false,
            version: "v6",
          }),
        );
        const [usage, finishReason, toolCalls, response] = await Promise.all([
          output.usage,
          output.finishReason,
          output.toolCalls,
          output.response,
        ]);
        if (cancellationController.signal.aborted) {
          throw new Error("AI run cancelled");
        }
        const evidenceData = workspaceKnowledgeEvidenceDataForRequestContext(input.requestContext);
        if (evidenceData) {
          writer.write({ data: evidenceData, type: KNOWLEDGE_EVIDENCE_DATA_PART });
        }
        await settleAiRunAttempt({
          attemptId: attempt.id,
          effectiveModel: response.modelId ?? workspaceAgentProfile.modelId,
          effectiveProvider: "dashscope",
          finishReason: finishReason ?? null,
          inputTokens: usage.inputTokens ?? null,
          outputTokens: usage.outputTokens ?? null,
          state: "succeeded",
          toolCallCount: toolCalls.length,
          totalTokens: usage.totalTokens ?? null,
        });

        if (input.shouldGenerateTitle && !cancellationController.signal.aborted) {
          const titleAttempt = await startAiRunAttempt({
            modelId: threadTitleProfile.modelId,
            profileSnapshot: threadTitleProfile,
            purpose: "thread_title",
            runId: input.run.id,
          });
          if (titleAttempt) {
            try {
              const update = await generateThreadTitle({
                abortSignal: AbortSignal.any([
                  AbortSignal.timeout(threadTitleProfile.timeoutMs),
                  cancellationController.signal,
                ]),
                conversationId: input.conversationId,
                createdByPrincipalId: input.createdByPrincipalId,
                firstUserMessage: input.effectiveText,
                onUsage: async (titleUsage) => {
                  await settleAiRunAttempt({
                    attemptId: titleAttempt.id,
                    effectiveModel: threadTitleProfile.modelId,
                    effectiveProvider: "dashscope",
                    finishReason: titleUsage.finishReason,
                    inputTokens: titleUsage.inputTokens ?? null,
                    outputTokens: titleUsage.outputTokens ?? null,
                    state: "succeeded",
                    totalTokens: titleUsage.totalTokens ?? null,
                  });
                },
                workspace: input.workspace,
              });
              if (cancellationController.signal.aborted) {
                throw new Error("AI run cancelled");
              }
              if (update) {
                writer.write({ data: update, transient: true, type: "data-threadTitle" });
              }
            } catch (error) {
              const titleCancelled = cancellationController.signal.aborted;
              await settleAiRunAttempt({
                attemptId: titleAttempt.id,
                errorCode: titleCancelled ? "user_abort_requested" : "thread_title_failed",
                state: titleCancelled ? "cancelled" : "failed",
              });
              if (titleCancelled) throw error;
              webLogger.warn(
                {
                  attemptId: titleAttempt.id,
                  component: "agent",
                  conversationId: input.conversationId,
                  error,
                  event: "agent.title.failed",
                  runId: input.run.id,
                  workspaceId: input.workspace.id,
                },
                "Workspace thread title generation failed",
              );
            }
          }
        }

        executionSucceeded = true;
        webLogger.info(
          {
            attemptId: attempt.id,
            component: "agent",
            conversationId: input.conversationId,
            durationMs: Date.now() - startedAt,
            event: "agent.run.completed",
            finishReason: finishReason ?? null,
            inputTokens: usage.inputTokens ?? null,
            outputTokens: usage.outputTokens ?? null,
            runId: input.run.id,
            totalTokens: usage.totalTokens ?? null,
            workspaceId: input.workspace.id,
          },
          "Workspace agent run completed",
        );
        endRunSpan({
          durationMs: Date.now() - startedAt,
          finishReason: finishReason ?? null,
          ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
          ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
          ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
        });
      } catch (error) {
        const classification = abortClassification(
          timeoutSignal,
          cancellationController.signal,
          error,
        );
        endRunSpan({
          durationMs: Date.now() - startedAt,
          ...(classification.failureCode ? { failureCode: classification.failureCode } : {}),
        });
        logWorkspaceAgentFailure("Workspace agent stream failed", error, {
          attemptId: attempt.id,
          conversationId: input.conversationId,
          durationMs: Date.now() - startedAt,
          failureCode: classification.attemptErrorCode,
          runId: input.run.id,
          workspaceId: input.workspace.id,
        });
        await settleAiRunAttempt({
          attemptId: attempt.id,
          errorCode: classification.attemptErrorCode,
          state: classification.state,
        });
        await finishAiRun({
          abortReason: classification.abortReason,
          failureCode: classification.failureCode,
          runId: input.run.id,
          state: classification.state,
        });
        writer.write({ errorText: classification.attemptErrorCode, type: "error" });
      }
    }),
    generateId: () => assistantMessageId,
    onFinish: async ({ isAborted, responseMessage }) => {
      try {
        if (isAborted || cancellationController.signal.aborted) return;
        const planningToolCall = hasPlanningToolCall(responseMessage);
        if (!assistantMessageHasUserVisibleOutput(responseMessage) && !planningToolCall) {
          if (executionSucceeded) {
            await finishAiRun({
              failureCode: "agent_output_unavailable",
              runId: input.run.id,
              state: "failed",
            });
          }
          return;
        }
        const persisted = await appendAssistantToMessageSnapshot({
          conversationId: input.conversationId,
          message: responseMessage,
          sourceUserMessageId: input.requestContext.get("sourceUserMessageId"),
          workspaceId: input.workspace.id,
        });
        if (!persisted) {
          webLogger.info(
            {
              component: "agent",
              conversationId: input.conversationId,
              event: "agent.message_snapshot_superseded",
              runId: input.run.id,
              workspaceId: input.workspace.id,
            },
            "Workspace agent response was superseded by a newer message snapshot",
          );
        }
        if (executionSucceeded) {
          await completeAiRunAudit({ runId: input.run.id });
        }
      } catch (error) {
        await finishAiRun({
          failureCode: "agent_message_persistence_failed",
          runId: input.run.id,
          state: "failed",
        });
        throw error;
      } finally {
        unregisterAiRunCancellation(input.run.id, cancellationController);
        await clearAiConversationActiveStream({
          conversationId: input.conversationId,
          createdByPrincipalId: input.createdByPrincipalId,
          streamId: input.run.id,
          workspaceId: input.workspace.id,
        });
      }
    },
    originalMessages: input.messages,
  });

  return {
    headers: { "X-Spectra-Run-Id": input.run.id },
    stream,
    type: "stream",
  };
}
