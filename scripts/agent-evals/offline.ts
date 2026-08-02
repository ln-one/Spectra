import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { LanguageModelV3GenerateResult, LanguageModelV3Usage } from "@ai-sdk/provider";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { MockLanguageModelV3, mockValues } from "ai/test";
import { z } from "zod";
import {
  agenticRagTrajectoryCaseSchema,
  scoreAgenticRagTrajectory,
} from "@/features/agents/agentic-rag-eval";
import { workspaceAgentProfile } from "@/features/agents/config";
import { KNOWLEDGE_AGENT_INSTRUCTIONS, workspaceAgentInstructions } from "@/features/agents/server";
import type { WorkspaceAgentToolContext } from "@/features/agents/workspace-agent-tool-context";
import { prepareWorkspaceAgentStep } from "@/features/agents/workspace-agent-turn-policy";
import { type AgentEvalCaseResult, writeAgentEvalReport } from "./report";

const fixtureSchema = z
  .array(
    agenticRagTrajectoryCaseSchema.extend({
      prompt: z.string().min(1),
      surface: z.enum(["studio", "selection"]).default("studio"),
    }),
  )
  .min(1);
type OfflineCase = z.infer<typeof fixtureSchema>[number];

const modelUsage: LanguageModelV3Usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};

function modelToolStep(
  step: z.infer<typeof agenticRagTrajectoryCaseSchema>["expected"][number],
  index: number,
): LanguageModelV3GenerateResult {
  const toolCallId = `agentic-rag-${index + 1}`;
  const toolCall = {
    input: JSON.stringify(step.toolArgs ?? {}),
    toolCallId,
    toolName: step.name,
    type: "tool-call" as const,
  };
  return {
    content:
      step.stepType === "provider_tool_call"
        ? [
            { ...toolCall, providerExecuted: true },
            {
              result: { status: "ok" },
              toolCallId,
              toolName: step.name,
              type: "tool-result" as const,
            },
          ]
        : [toolCall],
    finishReason: { raw: "tool_calls", unified: "tool-calls" },
    usage: modelUsage,
    warnings: [],
  };
}

const modelFinalStep: LanguageModelV3GenerateResult = {
  content: [{ text: "Done.", type: "text" }],
  finishReason: { raw: "stop", unified: "stop" },
  usage: modelUsage,
  warnings: [],
};

function requestContext(testCase: OfflineCase) {
  const surface: WorkspaceAgentToolContext["surface"] =
    testCase.surface === "studio"
      ? { type: "studio" }
      : {
          artifactId: randomUUID(),
          expectedRevisionId: randomUUID(),
          focus: {
            blockIds: ["selected-paragraph"],
            kind: "teaching_document_blocks",
            revisionId: randomUUID(),
            selectedText: "需要改写的选区",
          },
          generationState: "ready",
          kind: "teaching_document",
          title: "Offline evaluation selection",
          type: "artifact_detail",
        };
  return new RequestContext<WorkspaceAgentToolContext>([
    ["actor", { handle: "agent-evaluation", principalId: "agent-evaluation" }],
    ["conversationId", randomUUID()],
    ["latestUserMessage", testCase.prompt],
    ["locale", "zh-CN"],
    ["rootRunId", randomUUID()],
    ["sourceUserMessageId", `user:agent-offline-evaluation:${testCase.id}`],
    ["surface", surface],
    ["workspaceId", randomUUID()],
  ]);
}

async function replayMastraTrajectory(testCase: OfflineCase) {
  const plannedSteps = testCase.expected;
  const nextResult = mockValues(...plannedSteps.map(modelToolStep), modelFinalStep);
  const model = new MockLanguageModelV3({ doGenerate: async () => nextResult() });
  const executableToolNames = new Set(
    plannedSteps.filter((step) => step.stepType === "tool_call").map((step) => step.name),
  );
  const executableTools = Object.fromEntries(
    [...executableToolNames].map((name) => [
      name,
      createTool({
        description: `Deterministic ${name} trajectory fixture tool.`,
        execute: async () => ({ status: "ok" as const }),
        id: name,
        inputSchema: z.record(z.string(), z.unknown()),
        outputSchema: z.object({ status: z.literal("ok") }),
      }),
    ]),
  );
  const tools = {
    ...executableTools,
    ...(plannedSteps.some((step) => step.stepType === "provider_tool_call")
      ? {
          web_search: {
            args: {},
            id: "fixture.web_search" as const,
            type: "provider-defined" as const,
          },
        }
      : {}),
  };
  const agent = new Agent({
    id: "agentic-rag-trajectory-fixture",
    instructions: ({ requestContext: activeContext }) =>
      `${workspaceAgentInstructions({
        artifactCreationCapabilities: new Set(["presentation", "animation"]),
        requestContext: activeContext,
      })} ${KNOWLEDGE_AGENT_INSTRUCTIONS}`,
    model,
    name: "Spectra Agent offline contract evaluation",
    tools,
  });
  const output = await agent.generate(testCase.prompt, {
    maxSteps: workspaceAgentProfile.maxSteps,
    modelSettings: {
      maxOutputTokens: workspaceAgentProfile.maxOutputTokens,
      temperature: workspaceAgentProfile.temperature,
    },
    prepareStep: prepareWorkspaceAgentStep,
    providerOptions: workspaceAgentProfile.providerOptions,
    requestContext: requestContext(testCase),
    toolCallConcurrency: 1,
  });
  return output.steps.flatMap((step) =>
    step.toolCalls.map((call) => {
      const payload = call.payload;
      const args = payload.args ?? {};
      return {
        name: payload.toolName,
        stepType: payload.providerExecuted
          ? ("provider_tool_call" as const)
          : ("tool_call" as const),
        ...(Object.keys(args).length > 0 ? { toolArgs: args } : {}),
      };
    }),
  );
}

async function main() {
  const fixturePath = new URL(
    "../../tests/fixtures/agentic-rag-trajectories.json",
    import.meta.url,
  );
  const cases = fixtureSchema.parse(JSON.parse(await readFile(fixturePath, "utf8")));
  const results: AgentEvalCaseResult[] = [];

  for (const testCase of cases) {
    const startedAt = performance.now();
    try {
      const actual = await replayMastraTrajectory(testCase);
      const workspaceSearches = actual.filter((step) => step.name === "search_workspace").length;
      if (workspaceSearches > 4) throw new Error("workspace_search_budget_exceeded");
      const creation = actual.findIndex((step) => step.name === "create_artifacts");
      const search = actual.findIndex((step) => step.name === "search_workspace");
      if (creation >= 0 && (search < 0 || search > creation)) {
        throw new Error("artifact_creation_not_retrieval_first");
      }
      if (
        ["mechanical-operation", "strict-selection-edit", "web-only"].includes(testCase.id) &&
        workspaceSearches !== 0
      ) {
        throw new Error("unnecessary_workspace_search");
      }
      const result = await scoreAgenticRagTrajectory(
        {
          expected: testCase.expected,
          id: testCase.id,
          ordering: testCase.ordering,
        },
        actual,
      );
      if (result.score !== 1) throw new Error("trajectory_score_failed");
      results.push({
        id: testCase.id,
        durationMs: performance.now() - startedAt,
        passed: true,
        scores: { trajectory: result.score },
      });
    } catch (error) {
      results.push({
        id: testCase.id,
        durationMs: performance.now() - startedAt,
        passed: false,
        failureCode: error instanceof Error ? error.message : "agent_eval_failed",
      });
    }
  }

  const { directory, report } = await writeAgentEvalReport({
    cases: results,
    mode: "offline",
    modelId: "MockLanguageModelV3-production-agent-contract",
  });
  console.log(
    JSON.stringify({
      status: report.passed ? "ok" : "failed",
      cases: report.cases.length,
      reportDirectory: directory,
    }),
  );
  if (!report.passed) throw new Error("agent_offline_evaluation_failed");
}

void main();
