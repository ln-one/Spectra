import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import {
  createContextPrecisionScorer,
  createFaithfulnessScorer,
  createHallucinationScorer,
  createNoiseSensitivityScorerLLM,
} from "@mastra/evals/scorers/prebuilt";
import * as nextEnv from "@next/env";
import { z } from "zod";
import { dashScopeEnvironment, dashScopeModels } from "@/ai/dashscope";
import { serverEnvironment } from "@/environment/server";
import {
  type AgenticRagTrajectoryStep,
  agenticRagTrajectoryCaseSchema,
  scoreAgenticRagTrajectory,
} from "@/features/agents/agentic-rag-eval";
import { createArtifactsToolInputSchema } from "@/features/agents/artifact-create-tool-contract";
import {
  proposeCurrentTeachingDocumentEditsToolInputSchema,
  teachingDocumentEditProposalToolOutputSchema,
} from "@/features/agents/artifact-edit-tool-contract";
import { ARTIFACT_AGENT_TOOL_IDS } from "@/features/agents/artifact-tool-protocol";
import { createWorkspaceAgentResources, workspaceAgentProfile } from "@/features/agents/config";
import {
  createWorkspaceKnowledgeAgentTools,
  type KnowledgeToolDependencies,
  knowledgeIterationControl,
  workspaceKnowledgeToolHooks,
} from "@/features/agents/knowledge-tool.server";
import { KNOWLEDGE_AGENT_INSTRUCTIONS, workspaceAgentInstructions } from "@/features/agents/server";
import type { WorkspaceAgentToolContext } from "@/features/agents/workspace-agent-tool-context";
import { prepareWorkspaceAgentStep } from "@/features/agents/workspace-agent-turn-policy";
import { knowledgeStructuredContentHash } from "@/features/knowledge/integrity";
import { type AgentEvalCaseResult, writeAgentEvalReport } from "./report";

nextEnv.loadEnvConfig(process.cwd());

const qualitySchema = z
  .object({
    baselineResponse: z.string().min(1),
    noisyQuery: z.string().min(1),
  })
  .strict();

const liveCaseSchema = agenticRagTrajectoryCaseSchema
  .extend({
    prompt: z.string().min(1),
    evidence: z.array(z.string().min(1)).max(8).default([]),
    quality: qualitySchema.optional(),
    surface: z.enum(["studio", "selection"]).default("studio"),
  })
  .strict();

type LiveCase = z.infer<typeof liveCaseSchema>;

const liveFixtureSchema = z.array(liveCaseSchema).min(1);

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createKnowledgeTools(testCase: LiveCase, workspaceId: string) {
  const snapshot = {
    collection: `agent-eval-${testCase.id}`,
    manifestHash: sha256(`manifest:${testCase.id}`),
    generationIds: [randomUUID()],
    referenceSourceIds: [],
    rootWorkspaceId: workspaceId,
    workspaceIds: [workspaceId],
  };
  const evidence = testCase.evidence.map((text, index) => {
    const content = { kind: "exact_text" as const, text };
    const locator = { kind: "text_range" as const, start: 0, end: text.length };
    const contentHash = knowledgeStructuredContentHash({
      content,
      fidelity: "source",
      locator,
    });
    return {
      id: randomUUID(),
      representationId: randomUUID(),
      ordinal: index,
      blockOrdinal: index,
      exactExcerpt: text,
      locator,
      content,
      fidelity: "source" as const,
      contentHash,
      capacityUnits: Math.max(1, Math.ceil(text.length / 4)),
      sourceId: randomUUID(),
      sourceName: `Evaluation source ${index + 1}`,
      workspaceId,
      workspaceName: "Agent evaluation workspace",
      workspaceRelation: "current" as const,
      sourceRevision: 1,
      representationHash: sha256(`representation:${testCase.id}:${index}`),
    };
  });
  const open: KnowledgeToolDependencies["open"] = async () => snapshot;
  const search: KnowledgeToolDependencies["search"] = async () => ({
    status: "ok",
    candidates: evidence.map((unit, index) => ({
      chunkId: randomUUID(),
      sourceId: unit.sourceId,
      workspaceId,
      workspaceName: unit.workspaceName,
      workspaceRelation: unit.workspaceRelation,
      sourceRevision: unit.sourceRevision,
      representationId: unit.representationId,
      rank: index + 1,
      retrievalRank: index + 1,
      rerankScore: 1 - index * 0.01,
      contextView: unit.exactExcerpt,
      contentHash: unit.contentHash,
    })),
    evidence,
    degradedReasons: [],
    guarantee: {
      scope: "agent-evaluation",
      orderedTopKExact: true,
      tieBreak: "point-identity-ascending",
      channelInput: "deterministic-fixture",
    },
    diagnostics: {
      candidateCount: evidence.length,
      packedCapacityUnits: evidence.reduce((total, unit) => total + unit.capacityUnits, 0),
    },
  });
  return createWorkspaceKnowledgeAgentTools({ open, search });
}

const createArtifacts = createTool({
  id: "create_artifacts",
  description:
    "Create the typed Artifacts requested by the latest user message after any required Workspace retrieval.",
  inputSchema: createArtifactsToolInputSchema,
  outputSchema: z.object({ status: z.literal("queued") }).strict(),
  strict: true,
  execute: async () => ({ status: "queued" as const }),
  toModelOutput: () => ({
    type: "text" as const,
    value: "Artifact creation queued.",
  }),
});

const proposeCurrentTeachingDocumentEdits = createTool({
  id: ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits,
  description:
    "Propose reviewable block-level edits to the ready teaching document currently open in the workbench. A validated selection is the complete scope; call this tool directly without reading or searching.",
  inputSchema: proposeCurrentTeachingDocumentEditsToolInputSchema,
  outputSchema: teachingDocumentEditProposalToolOutputSchema,
  strict: true,
  execute: async ({ edits, summary }) => ({
    artifactId: randomUUID(),
    baseRevisionId: randomUUID(),
    edits,
    kind: "teaching_document" as const,
    request: "Deterministic live evaluation proposal",
    runId: randomUUID(),
    summary,
    title: "Evaluation selection",
  }),
  toModelOutput: () => ({
    type: "text" as const,
    value: "A reviewable proposal was prepared. The document has not been changed.",
  }),
});

const webSearch = createTool({
  id: "web_search",
  description:
    "Search the current Web when the user explicitly requests a Web-only answer or needs current information.",
  inputSchema: z.object({ query: z.string().min(1) }).strict(),
  outputSchema: z.object({ status: z.literal("ok") }).strict(),
  strict: true,
  execute: async () => ({ status: "ok" as const }),
  toModelOutput: () => ({
    type: "text" as const,
    value: "Current Web information was verified.",
  }),
});

function surfaceFor(testCase: LiveCase): WorkspaceAgentToolContext["surface"] {
  if (testCase.surface === "studio") return { type: "studio" };
  return {
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
    title: "Evaluation selection",
    type: "artifact_detail",
  };
}

function requestContext(testCase: LiveCase, workspaceId: string) {
  return new RequestContext<WorkspaceAgentToolContext>([
    ["actor", { handle: "agent-evaluation", principalId: "agent-evaluation" }],
    ["conversationId", randomUUID()],
    ["latestUserMessage", testCase.prompt],
    ["locale", "zh-CN"],
    ["rootRunId", randomUUID()],
    ["sourceUserMessageId", `user:agent-evaluation:${testCase.id}`],
    ["surface", surfaceFor(testCase)],
    ["workspaceId", workspaceId],
  ]);
}

function actualTrajectory(output: Awaited<ReturnType<Agent["generate"]>>) {
  return output.steps.flatMap((step) =>
    step.toolCalls.map(
      (call): AgenticRagTrajectoryStep => ({
        name: call.payload.toolName,
        stepType: call.payload.providerExecuted ? "provider_tool_call" : "tool_call",
      }),
    ),
  );
}

function numericScore(value: unknown, failureCode: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(failureCode);
  return value;
}

function outputForQualityScoring(output: string) {
  return output.replace(/\s*\[\d+\]\(#knowledge-evidence-ke-[a-z0-9]{16}\)/gi, "").trim();
}

function createLiveJudgeModel() {
  const { apiKey, baseURL } = dashScopeEnvironment(serverEnvironment());
  return createOpenAI({ apiKey, baseURL }).responses(dashScopeModels.artifactSuggestion);
}

async function qualityScores(
  testCase: LiveCase & { quality: NonNullable<LiveCase["quality"]> },
  output: string,
  model: ReturnType<typeof createLiveJudgeModel>,
) {
  const [contextPrecisionResult, faithfulnessResult, hallucinationResult, noiseResult] =
    await Promise.all([
      createContextPrecisionScorer({
        model,
        options: { context: testCase.evidence },
      }).run({ input: testCase.prompt, output }),
      createFaithfulnessScorer({
        model,
        options: { context: testCase.evidence },
      }).run({ input: testCase.prompt, output }),
      createHallucinationScorer({
        model,
        options: { context: testCase.evidence },
      }).run({ input: testCase.prompt, output }),
      createNoiseSensitivityScorerLLM({
        model,
        options: {
          baselineResponse: testCase.quality.baselineResponse,
          noisyQuery: testCase.quality.noisyQuery,
        },
      }).run({ input: testCase.prompt, output }),
    ]);
  return {
    contextPrecision: numericScore(contextPrecisionResult.score, "context_precision_missing"),
    faithfulness: numericScore(faithfulnessResult.score, "faithfulness_missing"),
    hallucinationRate: numericScore(hallucinationResult.score, "hallucination_rate_missing"),
    noiseResistance: numericScore(noiseResult.score, "noise_resistance_missing"),
  };
}

function qualityFailureCode(scores: Awaited<ReturnType<typeof qualityScores>>) {
  if (scores.contextPrecision < 0.8) return "context_precision_below_threshold";
  if (scores.faithfulness < 0.8) return "faithfulness_below_threshold";
  if (scores.hallucinationRate > 0.2) return "hallucination_rate_above_threshold";
  if (scores.noiseResistance < 0.8) return "noise_resistance_below_threshold";
  return undefined;
}

async function evaluateCase(
  testCase: LiveCase,
  model: ReturnType<typeof createWorkspaceAgentResources>["model"],
  judgeModel: ReturnType<typeof createLiveJudgeModel>,
): Promise<AgentEvalCaseResult> {
  const startedAt = performance.now();
  const workspaceId = randomUUID();
  const context = requestContext(testCase, workspaceId);
  const agent = new Agent({
    hooks: workspaceKnowledgeToolHooks,
    id: `spectra-agent-live-eval-${testCase.id}`,
    instructions: ({ requestContext: activeContext }) =>
      `${workspaceAgentInstructions({
        artifactCreationCapabilities: new Set(["presentation", "animation"]),
        requestContext: activeContext,
      })} ${KNOWLEDGE_AGENT_INSTRUCTIONS}`,
    model,
    name: `Spectra Agent live evaluation ${testCase.id}`,
    tools: {
      ...createKnowledgeTools(testCase, workspaceId),
      create_artifacts: createArtifacts,
      propose_current_teaching_document_edits: proposeCurrentTeachingDocumentEdits,
      web_search: webSearch,
    },
  });
  let scores: Record<string, number> | undefined;
  try {
    const output = await agent
      .generate(testCase.prompt, {
        maxSteps: workspaceAgentProfile.maxSteps,
        modelSettings: {
          maxOutputTokens: workspaceAgentProfile.maxOutputTokens,
          temperature: workspaceAgentProfile.temperature,
        },
        onIterationComplete: knowledgeIterationControl,
        prepareStep: prepareWorkspaceAgentStep,
        providerOptions: workspaceAgentProfile.providerOptions,
        requestContext: context,
        toolCallConcurrency: 1,
      })
      .catch(() => {
        throw new Error("agent_generation_failed");
      });
    const trajectory = actualTrajectory(output);
    const trajectoryResult = await scoreAgenticRagTrajectory(
      {
        id: testCase.id,
        expected: testCase.expected,
        ordering: testCase.ordering,
      },
      trajectory,
    ).catch(() => {
      throw new Error("trajectory_evaluation_failed");
    });
    if (trajectoryResult.score !== 1) throw new Error("trajectory_score_failed");
    scores = { trajectory: trajectoryResult.score };
    if (testCase.quality) {
      const quality = await qualityScores(
        testCase as LiveCase & { quality: NonNullable<LiveCase["quality"]> },
        outputForQualityScoring(output.text),
        judgeModel,
      ).catch(() => {
        throw new Error("quality_evaluation_failed");
      });
      scores = {
        ...scores,
        ...quality,
      };
      const failureCode = qualityFailureCode(quality);
      if (failureCode) throw new Error(failureCode);
    }
    return {
      id: testCase.id,
      durationMs: performance.now() - startedAt,
      passed: true,
      scores,
    };
  } catch (error) {
    return {
      id: testCase.id,
      durationMs: performance.now() - startedAt,
      passed: false,
      ...(scores ? { scores } : {}),
      failureCode:
        error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
          ? error.message
          : "agent_live_evaluation_failed",
    };
  }
}

async function main() {
  const fixturePath = new URL("../../tests/fixtures/agentic-rag-live.json", import.meta.url);
  const cases = liveFixtureSchema.parse(JSON.parse(await readFile(fixturePath, "utf8")));
  const { model } = createWorkspaceAgentResources();
  const judgeModel = createLiveJudgeModel();
  const results: AgentEvalCaseResult[] = [];
  for (const testCase of cases) results.push(await evaluateCase(testCase, model, judgeModel));
  const { directory, report } = await writeAgentEvalReport({
    cases: results,
    mode: "live",
    modelId: workspaceAgentProfile.modelId,
    judgeModelId: dashScopeModels.artifactSuggestion,
  });
  console.log(
    JSON.stringify({
      status: report.passed ? "ok" : "failed",
      cases: report.cases.length,
      reportDirectory: directory,
    }),
  );
  if (!report.passed) throw new Error("agent_live_evaluation_failed");
}

void main();
