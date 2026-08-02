import type { LanguageModelV3GenerateResult, LanguageModelV3Usage } from "@ai-sdk/provider";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { MockLanguageModelV3, mockValues } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AnimationDetail } from "@/features/artifacts/animations/types";
import type { ArtifactDetail } from "@/features/artifacts/contract";
import type { TeachingDocumentFocus } from "@/features/artifacts/documents/refine";
import type { TeachingDocumentDetail } from "@/features/artifacts/documents/types";
import { ArtifactError } from "@/features/artifacts/errors";
import type { GameDetail } from "@/features/artifacts/games/types";
import type { ArtifactGroundingBundle } from "@/features/artifacts/grounding";
import type { ResolvedMindMapFocus } from "@/features/artifacts/mind-maps/refine";
import type { MindMapDetail } from "@/features/artifacts/mind-maps/types";
import type { ResolvedQuizFocus } from "@/features/artifacts/quizzes/refine";
import type { QuizDetail } from "@/features/artifacts/quizzes/types";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import { WorkspaceError } from "@/features/workspaces/errors";
import {
  type ArtifactCreationRequest,
  createArtifactsToolInputSchema,
  type PreviousArtifactCreationPlan,
  previousArtifactCreationPlanFromRequests,
} from "./artifact-create-tool-contract";
import type { ArtifactPlanToolRuntime } from "./artifact-create-tools.server";
import { applyCurrentQuizEditsToolInputSchema } from "./artifact-edit-tool-contract";
import type { ArtifactPlanWorkflowInput } from "./artifact-plan-dbos-contract.server";
import {
  listArtifactsToolInputSchema,
  readCurrentArtifactToolInputSchema,
  readTeachingDocumentToolInputSchema,
} from "./artifact-read-tool-contract";
import { ARTIFACT_AGENT_TOOL_IDS } from "./artifact-tool-protocol";
import {
  type ArtifactToolDependencies,
  createWorkspaceArtifactAgentTools,
} from "./artifact-tools.server";
import { workspaceArtifactToolsForContext } from "./server";
import type { WorkspaceAgentToolContext } from "./workspace-agent-tool-context";
import { prepareWorkspaceAgentStep } from "./workspace-agent-turn-policy";

const artifactId = "00000000-0000-4000-8000-000000000019";
const conversationId = "9924e340-a561-40d8-94de-86cfcda40ecb";
const workspaceId = "56a7adf8-9254-4b0f-bd50-2a462470af02";
const rootRunId = "10000000-0000-4000-8000-000000000001";
const actor = { handle: "alice", principalId: "principal-alice" };
const modelUsage: LanguageModelV3Usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};
const groundingBundle = (evidenceId: string, sourceId: string): ArtifactGroundingBundle => ({
  evidence: [
    {
      content: { kind: "exact_text", text: `Evidence ${evidenceId}` },
      contentHash: "a".repeat(64),
      evidenceId,
      fidelity: "source",
      locator: { end: 12, kind: "text_range", start: 0 },
      representationHash: "b".repeat(64),
      sourceId,
      sourceName: `${sourceId}.pdf`,
      sourceRevision: 1,
    },
  ],
  version: 1,
});

function teachingDocumentRequest(
  subject = "Teaching subject",
  objective = "Explain only the teaching subject",
): ArtifactCreationRequest {
  return {
    brief: { objective, requirements: [], sections: [], subject },
    groundingRefs: [],
    kind: "teaching_document",
    title: `${subject} document`,
  };
}

function mindMapRequest(
  subject = "Map subject",
  objective = "Organize only the map subject",
): ArtifactCreationRequest {
  return {
    brief: { branches: [], objective, requirements: [], subject },
    groundingRefs: [],
    kind: "mind_map",
    title: `${subject} map`,
  };
}

function quizRequest(
  subject = "Quiz subject",
  questionPlan = { multipleChoice: 2, questionCount: 8, singleChoice: 4, trueFalse: 2 },
): ArtifactCreationRequest {
  return {
    brief: {
      objective: "Assess only the quiz subject",
      questionPlan,
      requirements: [],
      subject,
    },
    groundingRefs: [],
    kind: "quiz",
    title: `${subject} quiz`,
  };
}

function gameRequest(
  subject = "Game subject",
  questionPlan = { questionCount: 12, singleChoice: 8, trueFalse: 4 },
): ArtifactCreationRequest {
  return {
    brief: {
      objective: "Practice only the game subject through Flap Revival",
      questionPlan,
      requirements: [],
      skin: "city_sunset",
      subject,
    },
    groundingRefs: [],
    kind: "game",
    title: `${subject} knowledge challenge`,
  };
}

function animationRequest(durationSeconds: number): ArtifactCreationRequest {
  return {
    brief: {
      durationSeconds,
      objective: "Demonstrate bubble sort",
      requirements: [],
      scenes: [],
      subject: "Bubble sort",
    },
    groundingRefs: [],
    kind: "animation",
    title: "Bubble sort animation",
  };
}

function creationInput(...requests: ArtifactCreationRequest[]) {
  return { briefContext: "latest" as const, requests };
}

function modelToolCall(input: unknown): LanguageModelV3GenerateResult {
  return {
    content: [
      {
        input: JSON.stringify(input),
        toolCallId: "call-create-artifact",
        toolName: ARTIFACT_AGENT_TOOL_IDS.commitArtifactPlan,
        type: "tool-call",
      },
    ],
    finishReason: { raw: "tool_calls", unified: "tool-calls" },
    usage: modelUsage,
    warnings: [],
  };
}

function artifactPlanInput(request: ArtifactCreationRequest) {
  return {
    items: [
      {
        goal: request.brief.objective,
        groundingRefs: request.groundingRefs,
        kind: request.kind,
        requirements: request.brief.requirements ?? [],
        title: request.title,
      },
    ],
  };
}

function artifactPlanRuntime(detail: ArtifactDetail): ArtifactPlanToolRuntime & {
  enqueue: ReturnType<typeof vi.fn>;
} {
  let workflowInput: ArtifactPlanWorkflowInput | null = null;
  const enqueue = vi.fn(async (input: ArtifactPlanWorkflowInput) => {
    workflowInput = input;
    return input.workflowId;
  });
  return {
    enqueue,
    readEvents: async (workflowId) => {
      if (!workflowInput) throw new Error("Artifact plan was not enqueued");
      const item = workflowInput.items[0];
      if (!item) throw new Error("Artifact plan item is missing");
      return (async function* events() {
        yield {
          index: 0,
          kind: item.kind,
          planItemId: item.planItemId,
          title: item.title,
          type: "item-running" as const,
          workflowId,
        };
        yield {
          artifact: detail,
          index: 0,
          planItemId: item.planItemId,
          type: "item-started" as const,
          workflowId,
        };
        yield { type: "completed" as const, workflowId };
      })();
    },
  };
}

function proposalModelToolCall(input: unknown, toolCallId: string): LanguageModelV3GenerateResult {
  return {
    content: [
      {
        input: JSON.stringify(input),
        toolCallId,
        toolName: ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits,
        type: "tool-call",
      },
    ],
    finishReason: { raw: "tool_calls", unified: "tool-calls" },
    usage: modelUsage,
    warnings: [],
  };
}

function modelText(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ text, type: "text" }],
    finishReason: { raw: "stop", unified: "stop" },
    usage: modelUsage,
    warnings: [],
  };
}

const queuedDetail: TeachingDocumentDetail = {
  artifact: null,
  createdAt: "2026-07-18T00:00:00.000Z",
  draft: null,
  failureCode: null,
  generationState: "queued",
  id: artifactId,
  kind: "teaching_document",
  generationAttemptId: null,
  generationSequence: 0,
  title: "Agent document",
  updatedAt: "2026-07-18T00:00:00.000Z",
  workspaceId,
};

const readyDetail: TeachingDocumentDetail = {
  ...queuedDetail,
  artifact: {
    createdAt: queuedDetail.createdAt,
    currentRevision: {
      artifactId,
      content: {
        document: {
          content: [
            {
              attrs: { id: "heading", level: 2 },
              content: [{ text: "Overview", type: "text" }],
              type: "heading",
            },
            {
              attrs: { id: "paragraph" },
              content: [{ text: "Document body", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        },
        generation: { outcome: "complete", rawOutput: "Document body", warnings: [] },
        schemaVersion: 2,
        sourceMarkdown: "Document body",
        title: "Agent document",
      },
      contentSha256: "a".repeat(64),
      createdAt: queuedDetail.createdAt,
      id: "00000000-0000-4000-8000-000000000020",
      parentRevisionId: null,
      revisionNumber: 1,
    },
    id: artifactId,
    title: "Agent document",
    updatedAt: queuedDetail.updatedAt,
    workspaceId,
  },
  draft: null,
  failureCode: null,
  generationState: "ready",
};

const queuedMindMapDetail: MindMapDetail = {
  artifact: null,
  createdAt: queuedDetail.createdAt,
  draft: null,
  failureCode: null,
  generationAttemptId: null,
  generationSequence: 0,
  generationState: "queued",
  id: "00000000-0000-4000-8000-000000000022",
  kind: "mind_map",
  title: "Agent mind map",
  updatedAt: queuedDetail.updatedAt,
  workspaceId,
};

const readyMindMapDetail: MindMapDetail = {
  ...queuedMindMapDetail,
  artifact: {
    createdAt: queuedMindMapDetail.createdAt,
    currentRevision: {
      artifactId: queuedMindMapDetail.id,
      content: {
        generation: { outcome: "complete", rawOutput: "{}", warnings: [] },
        nodes: [
          { id: "root", label: "Agent mind map", order: 0, parentId: null },
          { id: "branch-a", label: "Branch A", order: 0, parentId: "root" },
          { id: "branch-b", label: "Branch B", order: 1, parentId: "root" },
        ],
        rootId: "root",
        schemaVersion: 2,
      },
      contentSha256: "b".repeat(64),
      createdAt: queuedMindMapDetail.createdAt,
      id: "00000000-0000-4000-8000-000000000023",
      parentRevisionId: null,
      revisionNumber: 1,
    },
    id: queuedMindMapDetail.id,
    title: queuedMindMapDetail.title,
    updatedAt: queuedMindMapDetail.updatedAt,
    workspaceId,
  },
  draft: null,
  failureCode: null,
  generationState: "ready",
};

const queuedQuizDetail: QuizDetail = {
  artifact: null,
  createdAt: queuedDetail.createdAt,
  failureCode: null,
  generationAttemptId: null,
  generationSequence: 0,
  generationState: "queued",
  id: "00000000-0000-4000-8000-000000000024",
  kind: "quiz",
  title: "Agent quiz",
  updatedAt: queuedDetail.updatedAt,
  workspaceId,
};

const queuedGameDetail: GameDetail = {
  artifact: null,
  createdAt: queuedDetail.createdAt,
  failureCode: null,
  generationAttemptId: null,
  generationSequence: 0,
  generationState: "queued",
  id: "00000000-0000-4000-8000-000000000028",
  kind: "game",
  title: "Agent game",
  updatedAt: queuedDetail.updatedAt,
  workspaceId,
};

const queuedAnimationDetail: AnimationDetail = {
  artifact: null,
  createdAt: queuedDetail.createdAt,
  failureCode: null,
  generationAttemptId: null,
  generationDraft: null,
  generationSequence: 0,
  generationState: "queued",
  id: "00000000-0000-4000-8000-000000000029",
  kind: "animation",
  title: "Bubble sort animation",
  updatedAt: queuedDetail.updatedAt,
  workspaceId,
};

const readyQuizDetail: QuizDetail = {
  ...queuedQuizDetail,
  artifact: {
    createdAt: queuedQuizDetail.createdAt,
    currentRevision: {
      artifactId: queuedQuizDetail.id,
      content: {
        descriptionMarkdown: "Quiz description",
        questions: [
          {
            correctAnswer: true,
            difficulty: "easy",
            explanationMarkdown: "Because it is true.",
            points: 1,
            promptMarkdown: "This is true.",
            questionId: "00000000-0000-4000-8000-000000000025",
            type: "true_false",
          },
          {
            correctAnswer: false,
            difficulty: "easy",
            explanationMarkdown: "Because it is false.",
            points: 1,
            promptMarkdown: "This is false.",
            questionId: "00000000-0000-4000-8000-000000000027",
            type: "true_false",
          },
        ],
        schemaVersion: 1,
        settings: { feedbackMode: "after_submission", navigationMode: "free" },
        title: "Agent quiz",
      },
      contentSha256: "c".repeat(64),
      createdAt: queuedQuizDetail.createdAt,
      id: "00000000-0000-4000-8000-000000000026",
      parentRevisionId: null,
      revisionNumber: 1,
    },
    id: queuedQuizDetail.id,
    title: queuedQuizDetail.title,
    updatedAt: queuedQuizDetail.updatedAt,
    workspaceId,
  },
  failureCode: null,
  generationState: "ready",
};

const readyGameDetail: GameDetail = {
  ...queuedGameDetail,
  artifact: {
    createdAt: queuedGameDetail.createdAt,
    currentRevision: {
      artifactId: queuedGameDetail.id,
      content: {
        descriptionMarkdown: "Game description",
        questions: Array.from({ length: 6 }, (_, index) =>
          index % 2 === 0
            ? {
                correctOptionId: `00000000-0000-4000-8000-${String(100 + index * 2).padStart(12, "0")}`,
                difficulty: "easy" as const,
                explanationMarkdown: "Because it is correct.",
                options: [
                  {
                    optionId: `00000000-0000-4000-8000-${String(100 + index * 2).padStart(12, "0")}`,
                    text: "Correct",
                  },
                  {
                    optionId: `00000000-0000-4000-8000-${String(101 + index * 2).padStart(12, "0")}`,
                    text: "Distractor",
                  },
                ],
                points: 1 as const,
                promptMarkdown: `Game question ${index + 1}`,
                questionId: `00000000-0000-4000-8000-${String(30 + index).padStart(12, "0")}`,
                type: "single_choice" as const,
              }
            : {
                correctAnswer: true,
                difficulty: "easy" as const,
                explanationMarkdown: "Because it is true.",
                points: 1 as const,
                promptMarkdown: `Game statement ${index + 1}`,
                questionId: `00000000-0000-4000-8000-${String(30 + index).padStart(12, "0")}`,
                type: "true_false" as const,
              },
        ),
        revival: { questionCount: 3, requiredCorrect: 2 },
        schemaVersion: 1,
        skin: "city_sunset",
        template: "flap_revival",
        title: "Agent game",
      },
      contentSha256: "d".repeat(64),
      createdAt: queuedGameDetail.createdAt,
      id: "00000000-0000-4000-8000-000000000031",
      parentRevisionId: null,
      revisionNumber: 1,
    },
    id: queuedGameDetail.id,
    title: queuedGameDetail.title,
    updatedAt: queuedGameDetail.updatedAt,
    workspaceId,
  },
  failureCode: null,
  generationState: "ready",
};

function requestContext(
  locale: WorkspaceAgentToolContext["locale"] = "en-US",
  latestUserMessage = "生成区块链教学文档和思维导图",
  previousArtifactCreationPlan?: PreviousArtifactCreationPlan,
) {
  const context = new RequestContext<WorkspaceAgentToolContext>([
    ["actor", actor],
    ["conversationId", conversationId],
    ["forceWebSearch", false],
    ["forceWorkspaceRetrieval", false],
    ["latestUserMessage", latestUserMessage],
    ["intent", "chat"],
    ["locale", locale],
    ["rootRunId", rootRunId],
    ["sourceUserMessageId", "user:agent-tool"],
    ["surface", { type: "studio" }],
    ["workspaceId", workspaceId],
  ]);
  if (previousArtifactCreationPlan) {
    context.set("previousArtifactCreationPlan", previousArtifactCreationPlan);
  }
  return context;
}

function requestContextWithMastraMemory() {
  return new RequestContext<WorkspaceAgentToolContext & { MastraMemory: { id: string } }>([
    ["actor", actor],
    ["conversationId", conversationId],
    ["forceWebSearch", false],
    ["forceWorkspaceRetrieval", false],
    ["latestUserMessage", "Create the requested artifact"],
    ["intent", "chat"],
    ["locale", "en-US"],
    ["rootRunId", rootRunId],
    ["sourceUserMessageId", "user:agent-tool"],
    ["surface", { type: "studio" }],
    ["workspaceId", workspaceId],
    ["MastraMemory", { id: "framework-owned-memory" }],
  ]);
}

function currentArtifactContext(
  kind: "game" | "mind_map" | "teaching_document" | "quiz",
  focus?: TeachingDocumentFocus | ResolvedMindMapFocus | ResolvedQuizFocus,
) {
  const detail =
    kind === "game"
      ? readyGameDetail
      : kind === "mind_map"
        ? readyMindMapDetail
        : kind === "quiz"
          ? readyQuizDetail
          : readyDetail;
  if (!detail.artifact) throw new Error("Expected ready Artifact fixture");
  return new RequestContext<WorkspaceAgentToolContext>([
    ["actor", actor],
    ["conversationId", conversationId],
    ["forceWebSearch", false],
    ["forceWorkspaceRetrieval", false],
    ["latestUserMessage", "修改当前成果"],
    ["intent", "chat"],
    ["locale", "zh-CN"],
    ["rootRunId", rootRunId],
    ["sourceUserMessageId", "user:agent-tool"],
    [
      "surface",
      {
        artifactId: detail.id,
        expectedRevisionId: detail.artifact.currentRevision.id,
        generationState: "ready",
        kind,
        title: detail.title,
        type: "artifact_detail",
        ...(focus ? { focus } : {}),
      },
    ],
    ["workspaceId", workspaceId],
  ]);
}

async function executeTool<Result>(
  tool: object,
  input: unknown,
  context: unknown,
): Promise<Result> {
  const execute: unknown = Reflect.get(tool, "execute");
  if (typeof execute !== "function") throw new Error("Expected executable tool");
  return (await execute(input, context)) as Result;
}

async function toolModelOutput<Result>(tool: object, output: unknown): Promise<Result> {
  const toModelOutput: unknown = Reflect.get(tool, "toModelOutput");
  if (typeof toModelOutput !== "function") throw new Error("Expected tool model output mapper");
  return (await toModelOutput(output)) as Result;
}

function dependencies(overrides: Partial<ArtifactToolDependencies> = {}): ArtifactToolDependencies {
  return {
    createTeachingDocument: vi.fn().mockResolvedValue(queuedDetail),
    getTeachingDocumentDetail: vi.fn().mockResolvedValue(readyDetail),
    listHistory: vi.fn().mockResolvedValue([]),
    publishProposal: vi.fn().mockImplementation(async (_actor, input) => input.proposal),
    ...overrides,
  };
}

describe("workspace Artifact agent tools", () => {
  it("enables provider-native strict input generation for every tool", () => {
    const tools = createWorkspaceArtifactAgentTools(dependencies());

    expect(Object.values(tools)).not.toHaveLength(0);
    for (const tool of Object.values(tools)) {
      expect(Reflect.get(tool, "strict")).toBe(true);
    }
  });

  it.each([
    {
      detail: queuedDetail,
      request: teachingDocumentRequest(),
    },
    {
      detail: queuedMindMapDetail,
      request: mindMapRequest(),
    },
    {
      detail: queuedQuizDetail,
      request: quizRequest(),
    },
    {
      detail: queuedGameDetail,
      request: gameRequest(),
    },
  ])("completes a real Mastra commit_artifact_plan tool loop for $request.kind", async ({
    detail,
    request,
  }) => {
    const planRuntime = artifactPlanRuntime(detail);
    const tools = createWorkspaceArtifactAgentTools(dependencies(), {
      artifactPlanRuntime: planRuntime,
    });
    const nextModelResult = mockValues(
      modelToolCall(artifactPlanInput(request)),
      modelText("Artifact creation started."),
    );
    const model = new MockLanguageModelV3({
      doGenerate: async () => nextModelResult(),
    });
    const agent = new Agent({
      id: `artifact-tool-loop-${request.kind}`,
      instructions: "Call commit_artifact_plan exactly once, then confirm its result.",
      model,
      name: "Artifact tool loop regression guard",
      tools: ({ requestContext: context }) => workspaceArtifactToolsForContext(tools, context.all),
    });

    const output = await agent.generate("Create the requested artifact.", {
      maxSteps: 2,
      prepareStep: prepareWorkspaceAgentStep,
      requestContext: requestContext(),
    });

    expect(output.text).toBe("Artifact creation started.");
    expect(planRuntime.enqueue).toHaveBeenCalledOnce();
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(model.doGenerateCalls[0]?.tools?.map((tool) => tool.name)).toContain(
      ARTIFACT_AGENT_TOOL_IDS.commitArtifactPlan,
    );
    expect(model.doGenerateCalls[1]?.prompt).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "tool" })]),
    );
    expect(model.doGenerateCalls[1]?.toolChoice).toMatchObject({ type: "none" });
  });

  it("streams a result card before commit_artifact_plan returns", async () => {
    const planRuntime = artifactPlanRuntime(queuedDetail);
    const tools = createWorkspaceArtifactAgentTools(dependencies(), {
      artifactPlanRuntime: planRuntime,
    });
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.commitArtifactPlan];
    const events: string[] = [];
    const result = await executeTool(tool, artifactPlanInput(teachingDocumentRequest()), {
      requestContext: requestContext("en-US"),
      writer: {
        custom: vi.fn(async (part: { type: string }) => {
          events.push(part.type);
        }),
      },
    });
    events.push("returned");

    expect(result).toMatchObject({
      results: [{ status: "started" }],
    });
    expect(events).toEqual([
      "data-artifactPlanProgress",
      "data-artifactStarted",
      "data-artifactPlanProgress",
      "returned",
    ]);
  });

  it("lets Mastra feed a proposal scope error back to the model and retry successfully", async () => {
    if (!readyDetail.artifact) throw new Error("Missing proposal fixture");
    const allowed = readyDetail.artifact.currentRevision.content.document.content[1];
    const outside = readyDetail.artifact.currentRevision.content.document.content[0];
    if (!allowed || !outside) throw new Error("Missing proposal targets");
    const publishProposal = vi.fn().mockImplementation(async (_actor, input) => input.proposal);
    const tools = createWorkspaceArtifactAgentTools(dependencies({ publishProposal }));
    const invalidInput = {
      edits: [{ blockId: outside.attrs.id, operation: "delete_block" }],
      groundingRefs: [],
      summary: "Wrong target",
    };
    const validInput = {
      edits: [
        {
          blockId: allowed.attrs.id,
          operation: "replace_block",
          replacementMarkdown: "Scoped body",
        },
      ],
      groundingRefs: [],
      summary: "Scoped revision",
    };
    const nextModelResult = mockValues(
      proposalModelToolCall(invalidInput, "call-invalid-proposal"),
      proposalModelToolCall(validInput, "call-valid-proposal"),
      modelText("Proposal ready for review."),
    );
    const model = new MockLanguageModelV3({
      doGenerate: async () => nextModelResult(),
    });
    const agent = new Agent({
      id: "proposal-tool-error-loop",
      instructions: "Correct proposal tool errors and retry.",
      model,
      name: "Proposal tool error regression guard",
      tools: ({ requestContext: context }) => workspaceArtifactToolsForContext(tools, context.all),
    });
    const focus: TeachingDocumentFocus = {
      blockIds: [allowed.attrs.id],
      kind: "teaching_document_blocks",
      revisionId: readyDetail.artifact.currentRevision.id,
      selectedText: "Document body",
    };

    const output = await agent.generate("Revise the selected block.", {
      maxSteps: 3,
      prepareStep: prepareWorkspaceAgentStep,
      requestContext: currentArtifactContext("teaching_document", focus),
    });

    expect(output.text).toBe("Proposal ready for review.");
    expect(publishProposal).toHaveBeenCalledOnce();
    expect(publishProposal).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        proposal: expect.objectContaining({
          edits: [expect.objectContaining({ blockId: allowed.attrs.id })],
        }),
      }),
    );
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain("proposal_scope_violation");
  });

  it("accepts framework-owned Mastra request context values", async () => {
    const createTeachingDocument = vi.fn().mockResolvedValue(queuedDetail);
    const tools = createWorkspaceArtifactAgentTools(dependencies({ createTeachingDocument }));
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");

    await expect(
      executeTool(tool, creationInput(teachingDocumentRequest()), {
        requestContext: requestContextWithMastraMemory(),
      }),
    ).resolves.toMatchObject({
      artifacts: [expect.objectContaining({ artifactId, generationState: "queued" })],
      status: "complete",
    });
    expect(createTeachingDocument).toHaveBeenCalledOnce();
  });

  it("creates with the trusted locale and emits the started event before returning", async () => {
    const events: string[] = [];
    const createTeachingDocument = vi.fn(async () => {
      events.push("started");
      return queuedDetail;
    });
    const tools = createWorkspaceArtifactAgentTools(dependencies({ createTeachingDocument }));
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");

    const result = await executeTool(tool, creationInput(teachingDocumentRequest()), {
      requestContext: requestContext("en-US"),
      writer: {
        async custom(part: { type: string }) {
          events.push(part.type);
        },
      },
    });
    events.push("returned");

    expect(createTeachingDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        conversationId,
        locale: "en-US",
        sourceUserMessageId: "user:agent-tool",
        workspaceId,
      }),
    );
    expect(result).toEqual({
      artifacts: [
        {
          artifactId,
          generationState: "queued",
          kind: "teaching_document",
          title: "Agent document",
        },
      ],
      failedKinds: [],
      status: "complete",
    });
    expect(events).toEqual(["started", "data-artifactStarted", "returned"]);
  });

  it("passes the typed animation duration to the generation service", async () => {
    const createAnimation = vi.fn().mockResolvedValue(queuedAnimationDetail);
    const tools = createWorkspaceArtifactAgentTools(dependencies({ createAnimation }), {
      artifactCreationCapabilities: new Set(["animation"]),
    });
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");

    await executeTool(tool, creationInput(animationRequest(15)), {
      requestContext: requestContext("zh-CN", "做一个15秒的冒泡排序动画"),
    });

    expect(createAnimation).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: 15,
        prompt: expect.stringContaining("Duration: 15 seconds"),
      }),
    );
  });

  it("creates both Artifact kinds through one bundle tool while hiding internal IDs", async () => {
    const createTeachingDocument = vi.fn().mockResolvedValue(queuedDetail);
    const createMindMap = vi.fn().mockResolvedValue(queuedMindMapDetail);
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ createMindMap, createTeachingDocument }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing bundle create tool");
    const emitted: unknown[] = [];
    const context = {
      requestContext: requestContext("zh-CN", "生成区块链思维导图和教学文档"),
      writer: {
        async custom(part: unknown) {
          emitted.push(part);
        },
      },
    };

    const result = await executeTool<{
      artifacts: Array<Record<string, unknown>>;
      failedKinds: string[];
      status: string;
    }>(
      tool,
      {
        ...creationInput(
          teachingDocumentRequest("Blockchain", "Explain blockchain concepts"),
          mindMapRequest("Blockchain", "Organize blockchain relationships"),
        ),
      },
      context,
    );
    const modelOutput = await toolModelOutput<{ type: string; value: string }>(tool, result);

    expect(createTeachingDocument).toHaveBeenCalledOnce();
    expect(createMindMap).toHaveBeenCalledOnce();
    expect(createTeachingDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Objective: Explain blockchain concepts"),
        requestedTitle: "Blockchain document",
      }),
    );
    expect(createMindMap).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Objective: Organize blockchain relationships"),
        requestedTitle: "Blockchain map",
      }),
    );
    expect(Reflect.get(createTeachingDocument.mock.calls[0]?.[0] ?? {}, "prompt")).not.toContain(
      "Organize blockchain relationships",
    );
    expect(Reflect.get(createMindMap.mock.calls[0]?.[0] ?? {}, "prompt")).not.toContain(
      "Explain blockchain concepts",
    );
    expect(emitted).toHaveLength(2);
    expect(result.status).toBe("complete");
    expect(result.failedKinds).toEqual([]);
    expect(result.artifacts).toEqual([
      expect.objectContaining({ artifactId, kind: "teaching_document" }),
      expect.objectContaining({ artifactId: queuedMindMapDetail.id, kind: "mind_map" }),
    ]);
    expect(modelOutput.value).toContain("Agent document");
    expect(modelOutput.value).toContain("Agent mind map");
    expect(JSON.stringify(modelOutput)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  });

  it("creates only one Quiz when the structured request contains only Quiz", async () => {
    const createQuiz = vi.fn().mockResolvedValue(queuedQuizDetail);
    const createMindMap = vi.fn();
    const createTeachingDocument = vi.fn();
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ createMindMap, createQuiz, createTeachingDocument }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");

    await expect(
      executeTool(
        tool,
        creationInput(
          quizRequest("Computer networking", {
            multipleChoice: 2,
            questionCount: 8,
            singleChoice: 4,
            trueFalse: 2,
          }),
        ),
        { requestContext: requestContext("zh-CN", "生成一份计算机网络随堂小测") },
      ),
    ).resolves.toMatchObject({
      artifacts: [{ kind: "quiz", title: "Agent quiz" }],
      failedKinds: [],
      status: "complete",
    });
    expect(createQuiz).toHaveBeenCalledOnce();
    expect(createQuiz).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("- Total: 8"),
        requestedTitle: "Computer networking quiz",
      }),
    );
    expect(Reflect.get(createQuiz.mock.calls[0]?.[0] ?? {}, "prompt")).toContain(
      "- Multiple choice: 2",
    );
    expect(createMindMap).not.toHaveBeenCalled();
    expect(createTeachingDocument).not.toHaveBeenCalled();
  });

  it("creates one Game with a self-contained question plan", async () => {
    const createGame = vi.fn().mockResolvedValue(queuedGameDetail);
    const createQuiz = vi.fn();
    const createTeachingDocument = vi.fn();
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ createGame, createQuiz, createTeachingDocument }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");

    await expect(
      executeTool(tool, creationInput(gameRequest("Ethereum and smart contracts")), {
        requestContext: requestContext(
          "zh-CN",
          "请创建一个Flap Revival游戏，聚焦以太坊与智能合约核心知识，提供12道单选或判断题进行自测。",
        ),
      }),
    ).resolves.toMatchObject({
      artifacts: [{ kind: "game", title: "Agent game" }],
      failedKinds: [],
      status: "complete",
    });
    expect(createGame).toHaveBeenCalledOnce();
    expect(createGame).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("- Total: 12"),
        requestedTitle: "Ethereum and smart contracts knowledge challenge",
      }),
    );
    expect(Reflect.get(createGame.mock.calls[0]?.[0] ?? {}, "prompt")).toContain(
      "- Single choice: 8",
    );
    expect(Reflect.get(createGame.mock.calls[0]?.[0] ?? {}, "prompt")).toContain("- True/false: 4");
    expect(createQuiz).not.toHaveBeenCalled();
    expect(createTeachingDocument).not.toHaveBeenCalled();
  });

  it("uses each planned brief instead of broadcasting the latest user message", async () => {
    const createTeachingDocument = vi.fn().mockResolvedValue(queuedDetail);
    const createMindMap = vi.fn().mockResolvedValue(queuedMindMapDetail);
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ createMindMap, createTeachingDocument }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing bundle create tool");

    await executeTool(
      tool,
      {
        ...creationInput(
          teachingDocumentRequest("Document subject", "Document-only objective"),
          mindMapRequest("Map subject", "Map-only objective"),
        ),
      },
      {
        requestContext: requestContext("zh-CN", "生成区块链思维导图和教学文档"),
      },
    );

    expect(createTeachingDocument).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining("Document-only objective") }),
    );
    expect(createMindMap).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining("Map-only objective") }),
    );
    const documentPrompt = Reflect.get(createTeachingDocument.mock.calls[0]?.[0] ?? {}, "prompt");
    const mapPrompt = Reflect.get(createMindMap.mock.calls[0]?.[0] ?? {}, "prompt");
    expect(documentPrompt).not.toContain("生成区块链思维导图和教学文档");
    expect(documentPrompt).not.toContain("Map-only objective");
    expect(mapPrompt).not.toContain("生成区块链思维导图和教学文档");
    expect(mapPrompt).not.toContain("Document-only objective");
  });

  it("resolves and passes a separate frozen Evidence bundle to each Artifact", async () => {
    const documentGrounding = groundingBundle(
      "11111111-1111-4111-8111-111111111111",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    const mapGrounding = groundingBundle(
      "22222222-2222-4222-8222-222222222222",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    const resolveGroundingRefs = vi.fn(async ({ refs }: { refs: readonly string[] }) =>
      refs[0] === "E1" ? documentGrounding : mapGrounding,
    );
    const createTeachingDocument = vi.fn().mockResolvedValue(queuedDetail);
    const createMindMap = vi.fn().mockResolvedValue(queuedMindMapDetail);
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ createMindMap, createTeachingDocument, resolveGroundingRefs }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");

    await executeTool(
      tool,
      {
        briefContext: "latest",
        requests: [
          { ...teachingDocumentRequest(), groundingRefs: ["E1"] },
          { ...mindMapRequest(), groundingRefs: ["E2"] },
        ],
      },
      { requestContext: requestContext() },
    );

    expect(createTeachingDocument).toHaveBeenCalledWith(
      expect.objectContaining({ grounding: documentGrounding }),
    );
    expect(createMindMap).toHaveBeenCalledWith(
      expect.objectContaining({ grounding: mapGrounding }),
    );
  });

  it("resolves the complete batch before starting any Artifact side effect", async () => {
    const createTeachingDocument = vi.fn().mockResolvedValue(queuedDetail);
    const createMindMap = vi.fn().mockResolvedValue(queuedMindMapDetail);
    const resolveGroundingRefs = vi.fn(async ({ refs }: { refs: readonly string[] }) => {
      if (refs.includes("E2")) throw new Error("workspace_grounding_ref_invalid");
      return groundingBundle(
        "11111111-1111-4111-8111-111111111111",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
    });
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ createMindMap, createTeachingDocument, resolveGroundingRefs }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");

    await expect(
      executeTool(
        tool,
        {
          briefContext: "latest",
          requests: [
            { ...teachingDocumentRequest(), groundingRefs: ["E1"] },
            { ...mindMapRequest(), groundingRefs: ["E2"] },
          ],
        },
        { requestContext: requestContext() },
      ),
    ).rejects.toThrow("workspace_grounding_ref_invalid");
    expect(createTeachingDocument).not.toHaveBeenCalled();
    expect(createMindMap).not.toHaveBeenCalled();
  });

  it("requires a trusted previous plan but does not concatenate it into continuation briefs", async () => {
    const createMindMap = vi.fn().mockResolvedValue(queuedMindMapDetail);
    const tools = createWorkspaceArtifactAgentTools(dependencies({ createMindMap }));
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");

    await executeTool(
      tool,
      {
        briefContext: "continue_previous_artifact_request",
        requests: [mindMapRequest("Blockchain", "Turn the prior subject into a mind map")],
      },
      {
        requestContext: requestContext("zh-CN", "照刚才的改成思维导图", {
          ...previousArtifactCreationPlanFromRequests([teachingDocumentRequest("Blockchain")]),
        }),
      },
    );

    expect(createMindMap).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Objective: Turn the prior subject into a mind map"),
      }),
    );
    expect(Reflect.get(createMindMap.mock.calls[0]?.[0] ?? {}, "prompt")).not.toContain(
      "Explain only the teaching subject",
    );
  });

  it("fails closed when continuation context is unavailable", async () => {
    const tools = createWorkspaceArtifactAgentTools(dependencies());
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");

    await expect(
      executeTool(
        tool,
        {
          briefContext: "continue_previous_artifact_request",
          requests: [teachingDocumentRequest()],
        },
        { requestContext: requestContext("zh-CN", "再来一个") },
      ),
    ).rejects.toThrow("previous_artifact_request_missing");
  });

  it("publishes a successful card and reports a structured partial bundle failure", async () => {
    const createTeachingDocument = vi.fn().mockResolvedValue(queuedDetail);
    const createMindMap = vi.fn().mockRejectedValue(new Error("mind_map_queue_unavailable"));
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ createMindMap, createTeachingDocument }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing bundle create tool");
    const emitted: unknown[] = [];

    const result = await executeTool<{
      artifacts: Array<Record<string, unknown>>;
      failedKinds: string[];
      status: string;
    }>(
      tool,
      {
        ...creationInput(teachingDocumentRequest(), mindMapRequest()),
      },
      {
        requestContext: requestContext("zh-CN"),
        writer: {
          async custom(part: unknown) {
            emitted.push(part);
          },
        },
      },
    );
    const modelOutput = await toolModelOutput<{ type: string; value: string }>(tool, result);

    expect(createTeachingDocument).toHaveBeenCalledOnce();
    expect(createMindMap).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      artifacts: [expect.objectContaining({ kind: "teaching_document" })],
      failedKinds: ["mind_map"],
      status: "partial",
    });
    expect(emitted).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ id: artifactId, kind: "teaching_document" }),
        type: "data-artifactStarted",
      }),
    ]);
    expect(modelOutput.value).toContain("Could not start: mind_map");
    expect(JSON.stringify(modelOutput)).not.toContain(artifactId);
  });

  it("exposes only the canonical Artifact creation tool to the Agent", () => {
    const tools = createWorkspaceArtifactAgentTools(dependencies());
    expect(tools).toHaveProperty(ARTIFACT_AGENT_TOOL_IDS.createArtifacts);
    expect(tools).not.toHaveProperty("create_teaching_document");
    expect(tools).not.toHaveProperty("create_mind_map");
  });

  it("accepts every currently supported Artifact kind in one batch", () => {
    const document = teachingDocumentRequest();
    const game = gameRequest();
    const map = mindMapRequest();
    const quiz = quizRequest();
    expect(
      createArtifactsToolInputSchema.parse({
        requests: [document],
      }),
    ).toEqual({
      briefContext: "latest",
      requests: [document],
    });
    for (const input of [
      { requests: [] },
      { requests: [map, map] },
      { prompt: "shared prompt", requests: [map] },
      {
        requests: [map, document, map],
      },
      {
        requests: [map, document, quiz, quiz],
      },
      { requests: [game, game] },
      creationInput(
        quizRequest("Invalid quiz", {
          multipleChoice: 1,
          questionCount: 3,
          singleChoice: 1,
          trueFalse: 0,
        }),
      ),
    ]) {
      expect(createArtifactsToolInputSchema.safeParse(input).success).toBe(false);
    }
    expect(
      createArtifactsToolInputSchema.safeParse({
        requests: [map, game, quiz, document],
      }).success,
    ).toBe(true);
  });

  it("rejects ambiguous Quiz answer indexes before applying edits", () => {
    const base = {
      difficulty: "medium",
      explanationMarkdown: "Explanation",
      options: ["A", "B"],
      points: 1,
      promptMarkdown: "Prompt",
      type: "multiple_choice",
    } as const;
    for (const correctOptionIndexes of [[0, 0], [0, 1], [2]]) {
      expect(
        applyCurrentQuizEditsToolInputSchema.safeParse({
          edits: [
            {
              question: { ...base, correctOptionIndexes },
              type: "add_question",
            },
          ],
        }).success,
      ).toBe(false);
    }
  });

  it("deduplicates repeated creation calls from one model response", async () => {
    const createMindMap = vi.fn().mockResolvedValue(queuedMindMapDetail);
    const events: string[] = [];
    const tools = createWorkspaceArtifactAgentTools(dependencies({ createMindMap }));
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing mind map create tool");
    const context = {
      requestContext: requestContext("en-US"),
      writer: {
        async custom(part: { type: string }) {
          events.push(part.type);
        },
      },
    };

    const input = creationInput(mindMapRequest());
    const first = await executeTool(tool, input, context);
    const second = await executeTool(tool, input, context);

    expect(first).toEqual(second);
    expect(createMindMap).toHaveBeenCalledOnce();
    expect(events).toEqual(["data-artifactStarted"]);
  });

  it("returns the first creation result when the model repeats creation with different input", async () => {
    const createTeachingDocument = vi.fn().mockResolvedValue(queuedDetail);
    const createMindMap = vi.fn().mockResolvedValue(queuedMindMapDetail);
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ createMindMap, createTeachingDocument }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");
    const context = { requestContext: requestContext("en-US") };

    const first = await executeTool(tool, creationInput(teachingDocumentRequest()), context);
    const repeated = await executeTool(tool, creationInput(mindMapRequest()), context);

    expect(repeated).toEqual(first);
    expect(createTeachingDocument).toHaveBeenCalledOnce();
    expect(createMindMap).not.toHaveBeenCalled();
  });

  it("throws when every requested creation fails", async () => {
    const createTeachingDocument = vi.fn().mockRejectedValue(new Error("queue_unavailable"));
    const tools = createWorkspaceArtifactAgentTools(dependencies({ createTeachingDocument }));
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.createArtifacts];
    if (!tool) throw new Error("Missing create tool");

    await expect(
      executeTool(tool, creationInput(teachingDocumentRequest()), {
        requestContext: requestContext(),
      }),
    ).rejects.toThrow("queue_unavailable");
  });

  it("coerces a numeric list limit emitted as a string", () => {
    expect(listArtifactsToolInputSchema.parse({ limit: "10" })).toEqual({
      limit: 10,
    });
  });

  it("publishes and accepts numeric cursor strings at artifact read boundaries", () => {
    expect(readCurrentArtifactToolInputSchema.parse({ cursor: "0" })).toEqual({ cursor: "0" });
    expect(readTeachingDocumentToolInputSchema.parse({ artifactId, cursor: "12" })).toEqual({
      artifactId,
      cursor: "12",
    });
    const jsonSchema = JSON.stringify(z.toJSONSchema(readCurrentArtifactToolInputSchema));
    expect(jsonSchema).toContain('"type":"integer"');
    expect(jsonSchema).toContain('"type":"string"');
    expect(() => readCurrentArtifactToolInputSchema.parse({ cursor: "next" })).toThrow();
    expect(() => readCurrentArtifactToolInputSchema.parse({ cursor: -1 })).toThrow();
  });

  it("lists only through the trusted conversation scope and applies the requested limit", async () => {
    const history: ArtifactHistoryItem[] = [
      {
        createdAt: queuedDetail.createdAt,
        currentRevisionId: null,
        generationState: "queued",
        id: artifactId,
        kind: "teaching_document",
        title: queuedDetail.title,
        updatedAt: queuedDetail.updatedAt,
      },
      {
        createdAt: queuedDetail.createdAt,
        currentRevisionId: null,
        generationState: "ready",
        id: "00000000-0000-4000-8000-000000000021",
        kind: "teaching_document",
        title: "Second",
        updatedAt: queuedDetail.updatedAt,
      },
    ];
    const listHistory = vi.fn().mockResolvedValue(history);
    const tools = createWorkspaceArtifactAgentTools(dependencies({ listHistory }));
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.listArtifacts];
    if (!tool) throw new Error("Missing list tool");

    const result = await executeTool<{ artifacts: unknown[] }>(
      tool,
      { limit: 1 },
      {
        requestContext: requestContext(),
      },
    );

    expect(listHistory).toHaveBeenCalledWith(actor, {
      conversationId,
      workspaceId,
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toEqual(expect.objectContaining({ artifactId }));
  });

  it("returns generation status or paged Markdown from an accessible document", async () => {
    const getTeachingDocumentDetail = vi
      .fn()
      .mockResolvedValueOnce(queuedDetail)
      .mockResolvedValueOnce(readyDetail);
    const tools = createWorkspaceArtifactAgentTools(dependencies({ getTeachingDocumentDetail }));
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.readTeachingDocument];
    if (!tool) throw new Error("Missing read tool");

    await expect(
      executeTool(tool, { artifactId, cursor: 0 }, { requestContext: requestContext() }),
    ).resolves.toMatchObject({
      contentMarkdown: null,
      generationState: "queued",
    });
    await expect(
      executeTool(tool, { artifactId, cursor: 0 }, { requestContext: requestContext() }),
    ).resolves.toMatchObject({
      contentMarkdown: "## Overview\n\nDocument body",
      generationState: "ready",
      nextCursor: null,
    });
    expect(getTeachingDocumentDetail).toHaveBeenLastCalledWith(actor, {
      artifactId,
      conversationId,
      workspaceId,
    });
  });

  it("proposes current teaching document edits without moving the revision", async () => {
    const tools = createWorkspaceArtifactAgentTools(dependencies());
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits];
    if (!tool || !readyDetail.artifact) throw new Error("Missing proposal fixture");
    const target = readyDetail.artifact.currentRevision.content.document.content[1];
    if (!target) throw new Error("Missing proposal target");
    const events: unknown[] = [];
    const context = {
      requestContext: currentArtifactContext("teaching_document"),
      writer: {
        async custom(event: unknown) {
          events.push(event);
        },
      },
    };
    const result = await executeTool<Record<string, unknown>>(
      tool,
      {
        edits: [
          {
            blockId: target.attrs.id,
            operation: "replace_block",
            replacementMarkdown: "Short body",
          },
        ],
        summary: "Shorten the body",
      },
      context,
    );
    const replay = await executeTool<Record<string, unknown>>(
      tool,
      {
        edits: [
          {
            blockId: target.attrs.id,
            operation: "replace_block",
            replacementMarkdown: "Short body",
          },
        ],
        summary: "Shorten the body",
      },
      context,
    );
    expect(result).toMatchObject({
      artifactId,
      baseRevisionId: readyDetail.artifact.currentRevision.id,
      runId: rootRunId,
    });
    expect(replay).toEqual(result);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "data-teachingDocumentEditProposed" });
    await expect(
      executeTool(
        tool,
        {
          edits: [{ blockId: target.attrs.id, operation: "delete_block" }],
          summary: "Different",
        },
        context,
      ),
    ).rejects.toThrow("teaching_document_proposal_already_created_this_run");
    const modelOutput = await toolModelOutput<{ value: string }>(tool, result);
    expect(modelOutput.value).not.toContain(artifactId);
  });

  it("rejects an out-of-selection proposal before publishing a corrected proposal once", async () => {
    const tools = createWorkspaceArtifactAgentTools(dependencies());
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits];
    if (!tool || !readyDetail.artifact) throw new Error("Missing proposal fixture");
    const allowed = readyDetail.artifact.currentRevision.content.document.content[1];
    const outside = readyDetail.artifact.currentRevision.content.document.content[0];
    if (!allowed || !outside) throw new Error("Missing proposal targets");
    const focus: TeachingDocumentFocus = {
      blockIds: [allowed.attrs.id],
      kind: "teaching_document_blocks",
      revisionId: readyDetail.artifact.currentRevision.id,
      selectedText: "Document body",
    };
    const events: unknown[] = [];
    const context = {
      requestContext: currentArtifactContext("teaching_document", focus),
      writer: {
        async custom(event: unknown) {
          events.push(event);
        },
      },
    };

    await expect(
      executeTool(
        tool,
        {
          edits: [{ blockId: outside.attrs.id, operation: "delete_block" }],
          summary: "Wrong target",
        },
        context,
      ),
    ).rejects.toThrow(
      `proposal_scope_violation: Only edit these selected block handles: [block:${allowed.attrs.id}]`,
    );
    expect(events).toHaveLength(0);

    await expect(
      executeTool(
        tool,
        {
          edits: [
            {
              blockId: allowed.attrs.id,
              operation: "replace_block",
              replacementMarkdown: "Scoped body",
            },
          ],
          summary: "Scoped revision",
        },
        context,
      ),
    ).resolves.toMatchObject({
      artifactId,
      edits: [expect.objectContaining({ blockId: allowed.attrs.id })],
    });
    expect(events).toHaveLength(1);
  });

  it("rejects every out-of-selection proposal without a local fallback state", async () => {
    const tools = createWorkspaceArtifactAgentTools(dependencies());
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.proposeCurrentTeachingDocumentEdits];
    if (!tool || !readyDetail.artifact) throw new Error("Missing proposal fixture");
    const allowed = readyDetail.artifact.currentRevision.content.document.content[1];
    const outside = readyDetail.artifact.currentRevision.content.document.content[0];
    if (!allowed || !outside) throw new Error("Missing proposal targets");
    const context = {
      requestContext: currentArtifactContext("teaching_document", {
        blockIds: [allowed.attrs.id],
        kind: "teaching_document_blocks",
        revisionId: readyDetail.artifact.currentRevision.id,
        selectedText: "Document body",
      }),
      writer: { custom: vi.fn() },
    };

    await expect(
      executeTool(
        tool,
        {
          edits: [{ blockId: outside.attrs.id, operation: "delete_block" }],
          summary: "Wrong target",
        },
        context,
      ),
    ).rejects.toThrow("proposal_scope_violation");
    await expect(
      executeTool(
        tool,
        {
          edits: [{ operation: "update_title", title: "Wrong title" }],
          summary: "Still wrong",
        },
        context,
      ),
    ).rejects.toThrow("proposal_scope_violation");
    expect(context.writer.custom).not.toHaveBeenCalled();
  });

  it("exposes stable current document and Mind Map handles only to the model tool result", async () => {
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ getMindMapDetail: vi.fn().mockResolvedValue(readyMindMapDetail) }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.readCurrentArtifact];
    if (!tool) throw new Error("Missing current artifact read tool");
    const result = await executeTool<Record<string, unknown>>(
      tool,
      { cursor: 0 },
      { requestContext: currentArtifactContext("mind_map") },
    );
    const modelOutput = await toolModelOutput<{ value: string }>(tool, result);

    expect(result).not.toHaveProperty("artifactId");
    expect(modelOutput.value).toContain("[node_id=root] Agent mind map");
    expect(modelOutput.value).not.toContain(readyMindMapDetail.id);

    const documentTools = createWorkspaceArtifactAgentTools(dependencies());
    const documentTool = documentTools[ARTIFACT_AGENT_TOOL_IDS.readCurrentArtifact];
    if (!documentTool) throw new Error("Missing current document read tool");
    const documentResult = await executeTool<Record<string, unknown>>(
      documentTool,
      { cursor: "0" },
      { requestContext: currentArtifactContext("teaching_document") },
    );
    const documentModelOutput = await toolModelOutput<{ value: string }>(
      documentTool,
      documentResult,
    );
    expect(documentModelOutput.value).toContain("[block:");
    expect(documentResult).not.toHaveProperty("artifactId");
  });

  it("rejects a Mind Map proposal that escapes the selected subtree before publishing", async () => {
    const getMindMapDetail = vi.fn().mockResolvedValue(readyMindMapDetail);
    const saveMindMapRevision = vi.fn();
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ getMindMapDetail, saveMindMapRevision }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.proposeCurrentMindMapEdits];
    if (!tool || !readyMindMapDetail.artifact) throw new Error("Missing Mind Map proposal tool");
    const context = {
      requestContext: currentArtifactContext("mind_map", {
        allowedNodeIds: ["branch-a"],
        contextMarkdown: "Breadcrumb: Agent mind map > Branch A\n- [node:branch-a] Branch A",
        kind: "mind_map_subtrees",
        nodeIds: ["branch-a"],
        revisionId: readyMindMapDetail.artifact.currentRevision.id,
      }),
      writer: { custom: vi.fn() },
    };

    await expect(
      executeTool(
        tool,
        { edits: [{ id: "branch-b", label: "Wrong", type: "update" }], summary: "Wrong" },
        context,
      ),
    ).rejects.toThrow("proposal_scope_violation: Only use these selected node IDs: branch-a");
    expect(context.writer.custom).not.toHaveBeenCalled();

    await expect(
      executeTool(
        tool,
        { edits: [{ id: "branch-a", label: "Scoped", type: "update" }], summary: "Scoped" },
        context,
      ),
    ).resolves.toMatchObject({
      artifactId: readyMindMapDetail.id,
      content: {
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "branch-a", label: "Scoped" }),
        ]),
      },
    });
    expect(context.writer.custom).toHaveBeenCalledOnce();
    expect(saveMindMapRevision).not.toHaveBeenCalled();
  });

  it("publishes a complete flat Mind Map tree as one atomic proposal", async () => {
    const getMindMapDetail = vi.fn().mockResolvedValue(readyMindMapDetail);
    const saveMindMapRevision = vi.fn();
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ getMindMapDetail, saveMindMapRevision }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.proposeCurrentMindMapEdits];
    if (!tool) throw new Error("Missing Mind Map proposal tool");
    const writer = { custom: vi.fn() };

    const result = await executeTool<Record<string, unknown>>(
      tool,
      {
        edits: [
          {
            levels: 3,
            nodes: [
              { key: "lifecycle", label: "Transaction lifecycle", parentKey: null },
              { key: "signing", label: "Signing", parentKey: "lifecycle" },
              { key: "validation", label: "Validation", parentKey: "signing" },
              { key: "broadcast", label: "Broadcast", parentKey: "signing" },
            ],
            parentId: "branch-a",
            type: "add_tree",
          },
        ],
        summary: "Extend the transaction lifecycle by three levels",
      },
      { requestContext: currentArtifactContext("mind_map"), writer },
    );

    expect(result).toMatchObject({
      content: {
        nodes: expect.arrayContaining([
          expect.objectContaining({ label: "Transaction lifecycle", parentId: "branch-a" }),
          expect.objectContaining({ label: "Signing" }),
          expect.objectContaining({ label: "Validation" }),
          expect.objectContaining({ label: "Broadcast" }),
        ]),
      },
      edits: [expect.objectContaining({ nodes: expect.any(Array), type: "add_tree" })],
    });
    expect(writer.custom).toHaveBeenCalledOnce();
    expect(saveMindMapRevision).not.toHaveBeenCalled();
  });

  it("rejects repeated Quiz proposals that escape the selected question", async () => {
    const getQuizDetail = vi.fn().mockResolvedValue(readyQuizDetail);
    const saveQuizRevision = vi.fn();
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ getQuizDetail, saveQuizRevision }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.proposeCurrentQuizEdits];
    if (!tool || !readyQuizDetail.artifact) throw new Error("Missing Quiz proposal tool");
    const selectedQuestionId =
      readyQuizDetail.artifact.currentRevision.content.questions[0]?.questionId;
    if (!selectedQuestionId) throw new Error("Missing Quiz question");
    const context = {
      requestContext: currentArtifactContext("quiz", {
        contextMarkdown: `[question:${selectedQuestionId}]\nThis is true.`,
        kind: "quiz_questions",
        questionIds: [selectedQuestionId],
        revisionId: readyQuizDetail.artifact.currentRevision.id,
      }),
      writer: { custom: vi.fn() },
    };

    await expect(
      executeTool(
        tool,
        { edits: [{ title: "Wrong", type: "update_settings" }], summary: "Wrong" },
        context,
      ),
    ).rejects.toThrow(
      `proposal_scope_violation: Only edit these selected question IDs: ${selectedQuestionId}`,
    );
    await expect(
      executeTool(
        tool,
        {
          edits: [
            {
              questionId: "00000000-0000-4000-8000-000000000027",
              type: "delete_question",
            },
          ],
          summary: "Still wrong",
        },
        context,
      ),
    ).rejects.toThrow("proposal_scope_violation");
    expect(context.writer.custom).not.toHaveBeenCalled();
    expect(saveQuizRevision).not.toHaveBeenCalled();
  });

  it("adds Mind Map children with server IDs and reports stale revision conflicts", async () => {
    const saveMindMapRevision = vi.fn().mockResolvedValue(readyMindMapDetail.artifact);
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({
        getMindMapDetail: vi.fn().mockResolvedValue(readyMindMapDetail),
        saveMindMapRevision,
      }),
    );
    const tool = tools[ARTIFACT_AGENT_TOOL_IDS.applyCurrentMindMapEdits];
    if (!tool) throw new Error("Missing mind map update tool");
    await executeTool(
      tool,
      { edits: [{ label: "Child", parentId: "root", type: "add_child" }] },
      { requestContext: currentArtifactContext("mind_map") },
    );
    expect(saveMindMapRevision).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        content: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: expect.any(String), label: "Child", parentId: "root" }),
          ]),
        }),
        expectedRevisionId: readyMindMapDetail.artifact?.currentRevision.id,
        producingRunId: rootRunId,
      }),
    );
  });

  it("reads stable Quiz IDs and appends an explicit Quiz revision", async () => {
    const saveQuizRevision = vi.fn().mockResolvedValue(readyQuizDetail.artifact);
    const getQuizDetail = vi.fn().mockResolvedValue(readyQuizDetail);
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ getQuizDetail, saveQuizRevision }),
    );
    const readTool = tools[ARTIFACT_AGENT_TOOL_IDS.readCurrentArtifact];
    const editTool = tools[ARTIFACT_AGENT_TOOL_IDS.applyCurrentQuizEdits];
    if (!readTool || !editTool || !readyQuizDetail.artifact) {
      throw new Error("Missing Quiz tool fixture");
    }

    const read = await executeTool<Record<string, unknown>>(
      readTool,
      { cursor: 0 },
      { requestContext: currentArtifactContext("quiz") },
    );
    expect(read.contentMarkdown).toContain("[question_id=00000000-0000-4000-8000-000000000025]");

    await executeTool(
      editTool,
      { edits: [{ feedbackMode: "immediate", title: "Practice Quiz", type: "update_settings" }] },
      { requestContext: currentArtifactContext("quiz") },
    );
    expect(saveQuizRevision).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        content: expect.objectContaining({
          settings: expect.objectContaining({ feedbackMode: "immediate" }),
          title: "Practice Quiz",
        }),
        expectedRevisionId: readyQuizDetail.artifact.currentRevision.id,
        producingRunId: rootRunId,
      }),
    );
  });

  it("reads stable Game IDs and directly appends a Game revision without a proposal", async () => {
    const saveGameRevision = vi.fn().mockResolvedValue(readyGameDetail.artifact);
    const getGameDetail = vi.fn().mockResolvedValue(readyGameDetail);
    const publishProposal = vi.fn();
    const tools = createWorkspaceArtifactAgentTools(
      dependencies({ getGameDetail, publishProposal, saveGameRevision }),
    );
    const readTool = tools[ARTIFACT_AGENT_TOOL_IDS.readCurrentArtifact];
    const editTool = tools[ARTIFACT_AGENT_TOOL_IDS.applyCurrentGameEdits];
    if (!readTool || !editTool || !readyGameDetail.artifact) {
      throw new Error("Missing Game tool fixture");
    }
    const gameContext = currentArtifactContext("game");
    const scopedTools = workspaceArtifactToolsForContext(tools, gameContext.all);
    expect(scopedTools[ARTIFACT_AGENT_TOOL_IDS.applyCurrentGameEdits]).toBeDefined();
    expect(Reflect.get(scopedTools, ARTIFACT_AGENT_TOOL_IDS.applyCurrentQuizEdits)).toBeUndefined();

    const read = await executeTool<Record<string, unknown>>(
      readTool,
      { cursor: 0 },
      { requestContext: gameContext },
    );
    expect(read.contentMarkdown).toContain("[question_id=00000000-0000-4000-8000-000000000030]");

    const writer = { custom: vi.fn() };
    await executeTool(
      editTool,
      {
        edits: [
          {
            question: {
              correctAnswer: false,
              difficulty: "medium",
              explanationMarkdown: "Updated explanation",
              points: 1,
              promptMarkdown: "Updated statement",
              type: "true_false",
            },
            questionId: "00000000-0000-4000-8000-000000000030",
            type: "update_question",
          },
        ],
      },
      { requestContext: gameContext, writer },
    );

    expect(saveGameRevision).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        content: expect.objectContaining({
          questions: expect.arrayContaining([
            expect.objectContaining({
              correctAnswer: false,
              promptMarkdown: "Updated statement",
              questionId: "00000000-0000-4000-8000-000000000030",
            }),
          ]),
        }),
        expectedRevisionId: readyGameDetail.artifact.currentRevision.id,
        producingRunId: rootRunId,
      }),
    );
    expect(publishProposal).not.toHaveBeenCalled();
    expect(writer.custom).toHaveBeenCalledWith(
      expect.objectContaining({ type: "data-artifactStarted", data: readyGameDetail }),
    );
  });

  it("fails closed without trusted context and normalizes inaccessible documents", async () => {
    const toolsWithoutContext = createWorkspaceArtifactAgentTools(dependencies());
    const listTool = toolsWithoutContext[ARTIFACT_AGENT_TOOL_IDS.listArtifacts];
    if (!listTool) throw new Error("Missing list tool");
    await expect(executeTool(listTool, { limit: 10 }, {})).resolves.toMatchObject({
      error: true,
      message: expect.stringContaining("Request context validation failed"),
    });

    const tools = createWorkspaceArtifactAgentTools(
      dependencies({
        getTeachingDocumentDetail: vi
          .fn()
          .mockRejectedValue(new ArtifactError("artifact_not_found")),
      }),
    );
    const readTool = tools[ARTIFACT_AGENT_TOOL_IDS.readTeachingDocument];
    if (!readTool) throw new Error("Missing read tool");
    await expect(
      executeTool(readTool, { artifactId, cursor: 0 }, { requestContext: requestContext() }),
    ).rejects.toThrow("artifact_not_accessible");

    const crossWorkspaceTools = createWorkspaceArtifactAgentTools(
      dependencies({
        getTeachingDocumentDetail: vi
          .fn()
          .mockRejectedValue(new WorkspaceError("workspace_not_found")),
      }),
    );
    const crossWorkspaceRead = crossWorkspaceTools[ARTIFACT_AGENT_TOOL_IDS.readTeachingDocument];
    if (!crossWorkspaceRead) throw new Error("Missing read tool");
    await expect(
      executeTool(
        crossWorkspaceRead,
        { artifactId, cursor: 0 },
        { requestContext: requestContext() },
      ),
    ).rejects.toThrow("artifact_not_accessible");
  });
});
