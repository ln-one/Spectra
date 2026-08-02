import { createHash } from "node:crypto";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceKnowledgeSearchResult } from "@/features/knowledge/contracts";
import { knowledgeStructuredContentHash } from "@/features/knowledge/integrity";
import {
  createWorkspaceKnowledgeAgentTools,
  type KnowledgeToolDependencies,
  knowledgeIterationControl,
  resolveWorkspaceKnowledgeGroundingRefs,
  workspaceKnowledgeEvidenceDataForRequestContext,
  workspaceKnowledgeToolHooks,
  workspaceKnowledgeVisualModelMessageForRequestContext,
} from "./knowledge-tool.server";
import { searchWorkspaceToolInputSchema } from "./knowledge-tool-contract";
import type { WorkspaceAgentToolContext } from "./workspace-agent-tool-context";

const workspaceId = "56a7adf8-9254-4b0f-bd50-2a462470af02";
const referencedWorkspaceId = "56a7adf8-9254-4b0f-bd50-2a462470af03";
const actor = { handle: "alice", principalId: "principal-alice" };
const queries = {
  purpose: "initial" as const,
  intentQuery: "Find the workspace deployment rollback rule",
  denseQuery: "How should a failed deployment be rolled back?",
  sparseQuery: "deployment rollback BG-42",
  rerankQuery: "What does the workspace say to do when deployment BG-42 fails?",
};
const snapshot = {
  collection: "knowledge-v1",
  manifestHash: "b".repeat(64),
  generationIds: ["00000000-0000-4000-8000-000000000041"],
  referenceSourceIds: ["00000000-0000-4000-8000-000000000042"],
  rootWorkspaceId: workspaceId,
  workspaceIds: [workspaceId, referencedWorkspaceId],
};

function dependencies(search: KnowledgeToolDependencies["search"]): KnowledgeToolDependencies {
  return {
    open: vi.fn(async () => snapshot),
    readVisual: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/webp" as const,
    })),
    search,
  };
}

function requestContext(rootRunId = "10000000-0000-4000-8000-000000000001") {
  return new RequestContext<WorkspaceAgentToolContext>([
    ["actor", actor],
    ["conversationId", "9924e340-a561-40d8-94de-86cfcda40ecb"],
    ["forceWebSearch", false],
    ["forceWorkspaceRetrieval", false],
    ["latestUserMessage", "What is the rollback rule?"],
    ["intent", "chat"],
    ["locale", "en-US"],
    ["rootRunId", rootRunId],
    ["sourceUserMessageId", "user:knowledge-tool"],
    ["surface", { type: "studio" }],
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

const result: WorkspaceKnowledgeSearchResult = {
  status: "ok",
  candidates: [],
  evidence: [
    {
      id: "00000000-0000-4000-8000-000000000031",
      sourceId: "00000000-0000-4000-8000-000000000032",
      sourcePresentation: { family: "pdf", kind: "file" },
      workspaceId: referencedWorkspaceId,
      workspaceName: "Deployment Runbooks",
      workspaceRelation: "referenced",
      sourceRevision: 1,
      representationHash: "a".repeat(64),
      representationId: "00000000-0000-4000-8000-000000000033",
      ordinal: 0,
      blockOrdinal: 0,
      exactExcerpt: "Shift traffic back to the blue environment.",
      locator: { kind: "text_range", start: 10, end: 53 },
      content: { kind: "exact_text", text: "Shift traffic back to the blue environment." },
      fidelity: "source",
      contentHash: knowledgeStructuredContentHash({
        content: { kind: "exact_text", text: "Shift traffic back to the blue environment." },
        fidelity: "source",
        locator: { kind: "text_range", start: 10, end: 53 },
      }),
      capacityUnits: 43,
    },
  ],
  degradedReasons: [],
  guarantee: {
    scope: "selected-local-shards-frozen-segment-view",
    orderedTopKExact: true,
    tieBreak: "point-identity-ascending",
    channelInput: "native-exact-rank-streams",
  },
  diagnostics: { candidateCount: 1, packedCapacityUnits: 43 },
};

function visualResult(): WorkspaceKnowledgeSearchResult {
  const baseEvidence = result.evidence[0];
  if (!baseEvidence) throw new Error("Expected visual Evidence fixture");
  const content = {
    accessibleDescription: "A blue deployment rollback diagram.",
    asset: { kind: "source_original" as const },
    kind: "visual_region" as const,
  };
  const locator = {
    boxes: [{ bottom: 1, left: 0, right: 1, top: 0 }],
    kind: "page_region" as const,
    pageIndex: 0,
  };
  return {
    ...result,
    evidence: [
      {
        ...baseEvidence,
        content,
        contentHash: knowledgeStructuredContentHash({ content, fidelity: "source", locator }),
        exactExcerpt: "A blue deployment rollback diagram.",
        locator,
      },
    ],
  };
}

describe("search_workspace Agent tool", () => {
  it("enables provider-native strict input generation", () => {
    const tools = createWorkspaceKnowledgeAgentTools(dependencies(vi.fn(async () => result)));

    expect(Reflect.get(tools.search_workspace, "strict")).toBe(true);
  });

  it("lets the Agent plan four queries and searches only the scoped Workspace", async () => {
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => result);
    const custom = vi.fn(async () => undefined);
    const tools = createWorkspaceKnowledgeAgentTools(dependencies(search));
    const output = await executeTool<typeof result>(tools.search_workspace, queries, {
      requestContext: requestContext(),
      writer: { custom },
    });

    expect(search).toHaveBeenCalledWith({
      actor,
      workspaceId,
      query: {
        denseQuery: queries.denseQuery,
        intentQuery: queries.intentQuery,
        rerankQuery: queries.rerankQuery,
        sparseQuery: queries.sparseQuery,
      },
      snapshot,
    });
    expect(output).toMatchObject({
      status: "ok",
      evidence: [
        {
          exactExcerpt: "Shift traffic back to the blue environment.",
          groundingRef: "E1",
          sourceName: "Workspace source",
          sourcePresentation: { family: "pdf", kind: "file" },
          workspaceOrigin: {
            workspaceId: referencedWorkspaceId,
            workspaceName: "Deployment Runbooks",
            workspaceRelation: "referenced",
          },
          sourceRevision: 1,
        },
      ],
    });
    const toModelOutput: unknown = Reflect.get(tools.search_workspace, "toModelOutput");
    if (typeof toModelOutput !== "function") throw new Error("Expected model output adapter");
    const modelOutput = toModelOutput(output) as { type: string; value: string };
    const modelPayload = JSON.parse(modelOutput.value) as {
      answerFormattingInstruction: string;
      artifactGroundingInstruction: string;
      citationInstruction: string;
      evidence: Array<Record<string, unknown>>;
    };
    expect(modelPayload.evidence[0]).toMatchObject({
      artifactGroundingRef: "E1",
      citation: expect.stringMatching(/^\[1\]\(#knowledge-evidence-ke-[a-z0-9]{16}\)$/),
    });
    expect(modelPayload.evidence[0]).not.toHaveProperty("groundingRef");
    expect(modelPayload.citationInstruction).toContain("artifactGroundingRef is not a citation");
    expect(modelPayload.citationInstruction).toContain(
      "a bracketed number such as [1] alone is not a citation",
    );
    expect(modelPayload.answerFormattingInstruction).toContain(
      "Evidence excerpts are literal source data, not ready-to-render Markdown",
    );
    expect(modelPayload.answerFormattingInstruction).toContain(
      "opening $$ and closing $$ each on its own line",
    );
    expect(modelPayload.answerFormattingInstruction).toContain(
      "Never copy bare LaTeX or write $$formula$$ on one line",
    );
    expect(modelPayload.artifactGroundingInstruction).toContain(
      "artifactGroundingRef is only a tool argument",
    );
    expect(custom).toHaveBeenCalledWith({
      type: "data-knowledgeEvidence",
      data: expect.objectContaining({
        schemaVersion: 2,
        evidence: [
          expect.objectContaining({
            citationNumber: 1,
            citationToken: expect.stringMatching(/^ke-[a-z0-9]{16}$/),
            evidenceId: "00000000-0000-4000-8000-000000000031",
          }),
        ],
      }),
    });
  });

  it("publishes only successfully prepared visual Evidence and exposes its model image", async () => {
    const readVisual = vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/webp" as const,
    }));
    const custom = vi.fn(async () => undefined);
    const tools = createWorkspaceKnowledgeAgentTools({
      open: vi.fn(async () => snapshot),
      readVisual,
      search: vi.fn(async () => visualResult()),
    });
    const scopedRequestContext = requestContext("10000000-0000-4000-8000-000000000091");
    const output = await executeTool<{
      evidence: Array<{ evidenceId: string }>;
      modelVisualEvidenceIds: string[];
    }>(tools.search_workspace, queries, {
      requestContext: scopedRequestContext,
      writer: { custom },
    });

    const visualEvidenceId = output.evidence[0]?.evidenceId;
    if (!visualEvidenceId) throw new Error("Expected selected visual Evidence");
    expect(output.modelVisualEvidenceIds).toEqual([visualEvidenceId]);
    expect(readVisual).toHaveBeenCalledWith({ actor, evidenceId: visualEvidenceId, workspaceId });
    const evidenceData = workspaceKnowledgeEvidenceDataForRequestContext(scopedRequestContext);
    const publishedVisual = evidenceData?.evidence[0];
    if (!publishedVisual) throw new Error("Expected public visual Evidence");
    expect(JSON.stringify(evidenceData)).not.toContain("AQID");
    expect(publishedVisual.content).toEqual({
      accessibleDescription: "A blue deployment rollback diagram.",
      kind: "visual_region",
    });
    expect(publishedVisual.contentHash).toBe(
      knowledgeStructuredContentHash({
        content: publishedVisual.content,
        fidelity: publishedVisual.fidelity,
        locator: publishedVisual.locator,
      }),
    );
    expect(evidenceData).toMatchObject({
      evidence: [{ evidenceId: visualEvidenceId }],
      renderableVisualEvidenceIds: [visualEvidenceId],
    });
    expect(custom).toHaveBeenCalledWith({
      type: "data-knowledgeEvidence",
      data: expect.objectContaining({ renderableVisualEvidenceIds: [visualEvidenceId] }),
    });
    const visualMessage =
      workspaceKnowledgeVisualModelMessageForRequestContext(scopedRequestContext);
    expect(visualMessage?.role).toBe("user");
    expect(visualMessage?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("citation") }),
        { type: "image", image: new Uint8Array([1, 2, 3]), mediaType: "image/webp" },
      ]),
    );
  });

  it("silently keeps text Evidence when visual preparation fails", async () => {
    const custom = vi.fn(async () => undefined);
    const tools = createWorkspaceKnowledgeAgentTools({
      open: vi.fn(async () => snapshot),
      readVisual: vi.fn(async () => {
        throw new Error("visual unavailable");
      }),
      search: vi.fn(async () => visualResult()),
    });
    const scopedRequestContext = requestContext("10000000-0000-4000-8000-000000000092");

    const output = await executeTool<{
      evidence: Array<{ evidenceId: string }>;
      modelVisualEvidenceIds: string[];
    }>(tools.search_workspace, queries, {
      requestContext: scopedRequestContext,
      writer: { custom },
    });

    expect(output.evidence).toHaveLength(1);
    expect(output.modelVisualEvidenceIds).toEqual([]);
    expect(workspaceKnowledgeVisualModelMessageForRequestContext(scopedRequestContext)).toBeNull();
    expect(
      workspaceKnowledgeEvidenceDataForRequestContext(scopedRequestContext),
    ).not.toHaveProperty("renderableVisualEvidenceIds");
    expect(custom).toHaveBeenCalledWith({
      type: "data-knowledgeEvidence",
      data: expect.not.objectContaining({ renderableVisualEvidenceIds: expect.anything() }),
    });
  });

  it("backfills a failed visual slot from the next ranked candidate", async () => {
    const baseVisual = visualResult().evidence[0];
    if (!baseVisual) throw new Error("Expected visual Evidence fixture");
    const visualIds = Array.from(
      { length: 4 },
      (_, index) => `00000000-0000-4000-8000-${String(210 + index).padStart(12, "0")}`,
    );
    const searchResult: WorkspaceKnowledgeSearchResult = {
      ...visualResult(),
      evidence: visualIds.map((id, index) => ({
        ...baseVisual,
        id,
        sourceId: `00000000-0000-4000-8000-${String(220 + index).padStart(12, "0")}`,
      })),
    };
    const readVisual = vi.fn(async ({ evidenceId }: { evidenceId: string }) => {
      if (evidenceId === visualIds[0]) throw new Error("first visual unavailable");
      return { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/webp" as const };
    });
    const tools = createWorkspaceKnowledgeAgentTools({
      open: vi.fn(async () => snapshot),
      readVisual,
      search: vi.fn(async () => searchResult),
    });

    const output = await executeTool<{ modelVisualEvidenceIds: string[] }>(
      tools.search_workspace,
      queries,
      { requestContext: requestContext("10000000-0000-4000-8000-000000000094") },
    );

    expect(output.modelVisualEvidenceIds).toEqual(visualIds.slice(1));
    expect(readVisual).toHaveBeenCalledTimes(4);
  });

  it("reserves a published Evidence slot for a relevant visual after dense text matches", async () => {
    const baseEvidence = result.evidence[0];
    if (!baseEvidence) throw new Error("Expected base Evidence fixture");
    const visual = visualResult().evidence[0];
    if (!visual) throw new Error("Expected visual Evidence fixture");
    const crowdedResult: WorkspaceKnowledgeSearchResult = {
      ...result,
      evidence: [
        ...Array.from({ length: 9 }, (_, index) => ({
          ...baseEvidence,
          id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
        })),
        {
          ...visual,
          id: "00000000-0000-4000-8000-000000000199",
        },
      ],
    };
    const tools = createWorkspaceKnowledgeAgentTools(
      dependencies(vi.fn(async () => crowdedResult)),
    );
    const output = await executeTool<{
      evidence: Array<{ content: { kind: string }; evidenceId: string }>;
      modelVisualEvidenceIds: string[];
    }>(tools.search_workspace, queries, { requestContext: requestContext() });

    expect(output.evidence).toHaveLength(8);
    expect(output.evidence.at(-1)).toMatchObject({
      content: { kind: "visual_region" },
      evidenceId: "00000000-0000-4000-8000-000000000199",
    });
    expect(output.modelVisualEvidenceIds).toEqual(["00000000-0000-4000-8000-000000000199"]);
  });

  it("accumulates at most three prepared visuals across searches", async () => {
    const baseVisual = visualResult().evidence[0];
    if (!baseVisual) throw new Error("Expected visual Evidence fixture");
    let round = 0;
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => {
      round += 1;
      return {
        ...visualResult(),
        evidence: [0, 1].map((offset) => {
          const suffix = round * 10 + offset;
          return {
            ...baseVisual,
            id: `00000000-0000-4000-8000-${String(300 + suffix).padStart(12, "0")}`,
            sourceId: `00000000-0000-4000-8000-${String(400 + suffix).padStart(12, "0")}`,
          };
        }),
      };
    });
    const readVisual = vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/webp" as const,
    }));
    const tools = createWorkspaceKnowledgeAgentTools({
      open: vi.fn(async () => snapshot),
      readVisual,
      search,
    });
    const scopedRequestContext = requestContext("10000000-0000-4000-8000-000000000093");
    const context = { requestContext: scopedRequestContext };

    const first = await executeTool<{ modelVisualEvidenceIds: string[] }>(
      tools.search_workspace,
      queries,
      context,
    );
    const second = await executeTool<{ modelVisualEvidenceIds: string[] }>(
      tools.search_workspace,
      { ...queries, purpose: "broaden", denseQuery: `${queries.denseQuery} broader` },
      context,
    );

    expect(first.modelVisualEvidenceIds).toHaveLength(2);
    expect(second.modelVisualEvidenceIds).toHaveLength(1);
    expect(readVisual).toHaveBeenCalledTimes(3);
    const visualMessage =
      workspaceKnowledgeVisualModelMessageForRequestContext(scopedRequestContext);
    expect(
      Array.isArray(visualMessage?.content)
        ? visualMessage.content.filter((part) => part.type === "image")
        : [],
    ).toHaveLength(3);
    expect(
      workspaceKnowledgeEvidenceDataForRequestContext(scopedRequestContext)
        ?.renderableVisualEvidenceIds,
    ).toHaveLength(3);
  });

  it("resolves selected refs only inside the same run and pinned corpus snapshot", async () => {
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => result);
    const open = vi.fn(async () => snapshot);
    const tools = createWorkspaceKnowledgeAgentTools({ open, search });
    const scopedRequestContext = requestContext("10000000-0000-4000-8000-000000000101");
    const scope = scopedRequestContext.all;

    await executeTool(tools.search_workspace, queries, {
      requestContext: scopedRequestContext,
    });
    const createEventSpan = vi.fn();
    await expect(
      resolveWorkspaceKnowledgeGroundingRefs({
        refs: ["E1"],
        requestContext: scopedRequestContext,
        scope,
        tracingContext: { currentSpan: { createEventSpan } },
      }),
    ).resolves.toMatchObject({
      evidence: [
        {
          content: { kind: "exact_text", text: "Shift traffic back to the blue environment." },
          evidenceId: "00000000-0000-4000-8000-000000000031",
          sourceName: "Workspace source",
        },
      ],
      version: 1,
    });
    expect(createEventSpan).toHaveBeenCalledWith({
      name: "artifact.grounding.resolved",
      type: "generic",
      output: {
        packedEvidenceCount: 1,
        resolvedEvidenceCount: 1,
        selectedRefCount: 1,
        sourceCount: 1,
      },
    });
    await expect(
      resolveWorkspaceKnowledgeGroundingRefs({
        refs: ["E1"],
        requestContext: requestContext("10000000-0000-4000-8000-000000000102"),
        scope: {
          ...scope,
          rootRunId: "10000000-0000-4000-8000-000000000102",
        },
      }),
    ).rejects.toThrow("workspace_grounding_session_missing");
  });

  it("rejects refs when the authorized corpus snapshot changes after search", async () => {
    const staleSnapshot = {
      ...snapshot,
      referenceSourceIds: ["00000000-0000-4000-8000-000000000099"],
    };
    const open = vi
      .fn<KnowledgeToolDependencies["open"]>()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(staleSnapshot);
    const tools = createWorkspaceKnowledgeAgentTools({
      open,
      search: vi.fn(async () => result),
    });
    const scopedRequestContext = requestContext("10000000-0000-4000-8000-000000000103");
    await executeTool(tools.search_workspace, queries, {
      requestContext: scopedRequestContext,
    });

    await expect(
      resolveWorkspaceKnowledgeGroundingRefs({
        refs: ["E1"],
        requestContext: scopedRequestContext,
        scope: scopedRequestContext.all,
      }),
    ).rejects.toThrow("workspace_grounding_snapshot_stale");
  });

  it("rejects incomplete planning and missing Agent scope", async () => {
    expect(() => searchWorkspaceToolInputSchema.parse({ denseQuery: "only one" })).toThrow();
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => result);
    const tools = createWorkspaceKnowledgeAgentTools(dependencies(search));
    await expect(
      executeTool<{ error: boolean }>(tools.search_workspace, queries, {}),
    ).resolves.toEqual(expect.objectContaining({ error: true }));
    expect(search).not.toHaveBeenCalled();
  });

  it("allows four distinct Knowledge searches in one request context", async () => {
    let resultRound = 0;
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => {
      resultRound += 1;
      return {
        ...result,
        evidence: result.evidence.map((evidence) => ({
          ...evidence,
          id: `00000000-0000-4000-8000-${String(resultRound).padStart(12, "0")}`,
        })),
      };
    });
    const tools = createWorkspaceKnowledgeAgentTools(dependencies(search));
    const context = { requestContext: requestContext() };
    let fourthOutput: unknown;
    for (let round = 0; round < 4; round += 1) {
      fourthOutput = await executeTool(
        tools.search_workspace,
        {
          ...queries,
          denseQuery: `${queries.denseQuery} ${round}`,
        },
        context,
      );
    }
    expect(fourthOutput).toMatchObject({
      control: {
        remainingSearches: 0,
        round: 4,
        stopReason: "budget_exhausted",
        stopRecommended: true,
      },
    });
    expect(
      workspaceKnowledgeToolHooks.beforeToolCall?.({
        context,
        input: { ...queries, denseQuery: "fifth" },
        toolName: "search_workspace",
      }),
    ).toMatchObject({
      proceed: false,
      output: { status: "stopped", control: { stopReason: "budget_exhausted" } },
    });
    await expect(
      executeTool(tools.search_workspace, { ...queries, denseQuery: "fifth" }, context),
    ).resolves.toMatchObject({ status: "stopped", control: { stopReason: "budget_exhausted" } });
    expect(search).toHaveBeenCalledTimes(4);
  });

  it("never assigns more than 32 grounding refs in one request context", async () => {
    const [baseEvidence] = result.evidence;
    if (!baseEvidence) throw new Error("Expected base Evidence fixture");
    let round = 0;
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => {
      round += 1;
      return {
        ...result,
        evidence: Array.from({ length: 12 }, (_, index) => ({
          ...baseEvidence,
          id: `00000000-0000-4000-8000-${String(round * 100 + index).padStart(12, "0")}`,
        })),
      };
    });
    const tools = createWorkspaceKnowledgeAgentTools(dependencies(search));
    const scopedRequestContext = requestContext("10000000-0000-4000-8000-000000000104");
    const context = { requestContext: scopedRequestContext };
    const outputs: Array<{ evidence: Array<{ groundingRef: string }> }> = [];
    for (let searchRound = 0; searchRound < 4; searchRound += 1) {
      outputs.push(
        await executeTool(
          tools.search_workspace,
          {
            ...queries,
            denseQuery: `${queries.denseQuery} cap-${searchRound}`,
          },
          context,
        ),
      );
    }

    expect(outputs.flatMap((output) => output.evidence)).toHaveLength(32);
    expect(outputs[3]?.evidence.at(-1)?.groundingRef).toBe("E32");
    await expect(
      resolveWorkspaceKnowledgeGroundingRefs({
        refs: ["E32"],
        requestContext: scopedRequestContext,
        scope: scopedRequestContext.all,
      }),
    ).resolves.toMatchObject({ evidence: [{ evidenceId: expect.any(String) }] });
    await expect(
      resolveWorkspaceKnowledgeGroundingRefs({
        refs: ["E33"],
        requestContext: scopedRequestContext,
        scope: scopedRequestContext.all,
      }),
    ).rejects.toThrow("workspace_grounding_ref_invalid");
  });

  it("blocks the seventh executable Agent tool call in the request context", () => {
    const context = {
      requestContext: requestContext("10000000-0000-4000-8000-000000000044"),
    };
    for (let call = 0; call < 6; call += 1) {
      expect(
        workspaceKnowledgeToolHooks.beforeToolCall?.({
          context,
          input: {},
          toolName: `artifact_tool_${call}`,
        }),
      ).toBeUndefined();
    }
    expect(() =>
      workspaceKnowledgeToolHooks.beforeToolCall?.({
        context,
        input: {},
        toolName: "artifact_tool_seven",
      }),
    ).toThrow("workspace_agent_tool_budget_exhausted");
  });

  it("revalidates authorization but reuses a repeated query from the request cache", async () => {
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => result);
    const open = vi.fn(async () => snapshot);
    const tools = createWorkspaceKnowledgeAgentTools({ open, search });
    const context = { requestContext: requestContext() };

    await expect(executeTool(tools.search_workspace, queries, context)).resolves.toMatchObject({
      status: "ok",
      control: { cacheHit: false, round: 1 },
    });
    await expect(executeTool(tools.search_workspace, queries, context)).resolves.toMatchObject({
      status: "stopped",
      control: { cacheHit: true, round: 2, stopReason: "cache_hit" },
    });
    expect(open).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledOnce();
  });

  it("publishes only new Evidence with stable turn-global citation numbers", async () => {
    let round = 0;
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => {
      round += 1;
      return {
        ...result,
        evidence: result.evidence.map((evidence) => ({
          ...evidence,
          id: `00000000-0000-4000-8000-${String(round).padStart(12, "0")}`,
        })),
      };
    });
    const custom = vi.fn(async (_part: unknown) => undefined);
    const tools = createWorkspaceKnowledgeAgentTools(dependencies(search));
    const context = { requestContext: requestContext(), writer: { custom } };
    await executeTool(tools.search_workspace, queries, context);
    await executeTool(
      tools.search_workspace,
      { ...queries, purpose: "verify", denseQuery: `${queries.denseQuery} verify` },
      context,
    );

    const citationNumbers = custom.mock.calls.map(([part]) => {
      if (!part || typeof part !== "object") throw new Error("Expected Evidence data part");
      const data = Reflect.get(part, "data");
      if (!data || typeof data !== "object") throw new Error("Expected Evidence data");
      const evidence = Reflect.get(data, "evidence");
      if (!Array.isArray(evidence) || !evidence[0] || typeof evidence[0] !== "object") {
        throw new Error("Expected published Evidence");
      }
      return Reflect.get(evidence[0], "citationNumber");
    });
    expect(citationNumbers).toEqual([1, 2]);
  });

  it("hard-fails when a repeated Evidence identity changes across search rounds", async () => {
    let round = 0;
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => {
      round += 1;
      return round === 1
        ? result
        : {
            ...result,
            evidence: result.evidence.map((unit) => ({
              ...unit,
              representationHash: "c".repeat(64),
            })),
          };
    });
    const tools = createWorkspaceKnowledgeAgentTools(dependencies(search));
    const context = {
      requestContext: requestContext("10000000-0000-4000-8000-000000000055"),
    };
    await executeTool(tools.search_workspace, queries, context);
    await expect(
      executeTool(
        tools.search_workspace,
        { ...queries, purpose: "verify", denseQuery: `${queries.denseQuery} conflict` },
        context,
      ),
    ).rejects.toThrow("knowledge_evidence_conflict");
  });

  it("records only safe search diagnostics on the active Mastra trace", async () => {
    const createEventSpan = vi.fn();
    const tools = createWorkspaceKnowledgeAgentTools(dependencies(vi.fn(async () => result)));
    await executeTool(tools.search_workspace, queries, {
      requestContext: requestContext("10000000-0000-4000-8000-000000000056"),
      tracingContext: { currentSpan: { createEventSpan } },
    });

    expect(createEventSpan).toHaveBeenCalledWith({
      name: "knowledge.search.result",
      type: "generic",
      output: {
        cacheHit: false,
        candidateCount: 1,
        durationMs: expect.any(Number),
        newEvidenceCount: 1,
        round: 1,
        status: "ok",
        stopReason: "continue",
      },
    });
  });

  it("injects completion feedback only for terminal retrieval results", () => {
    expect(
      knowledgeIterationControl({
        toolResults: [
          {
            name: "search_workspace",
            result: {
              status: "stopped",
              degradedReasons: [],
              candidateCount: 0,
              packedCapacityUnits: 0,
              modelVisualEvidenceIds: [],
              evidence: [],
              control: {
                round: 4,
                remainingSearches: 0,
                cacheHit: false,
                newEvidenceCount: 0,
                stopRecommended: true,
                stopReason: "budget_exhausted",
              },
            },
          },
        ],
      }),
    ).toMatchObject({ feedback: expect.stringContaining("Do not call search_workspace again") });
    expect(knowledgeIterationControl({ toolResults: [] })).toBeUndefined();
  });

  it("returns an unavailable result without publishing Evidence", async () => {
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => ({
      status: "unavailable" as const,
      candidates: [] as const,
      evidence: [] as const,
      degradedReasons: [] as const,
      guarantee: null,
      diagnostics: { candidateCount: 0, packedCapacityUnits: 0 } as const,
    }));
    const custom = vi.fn(async () => undefined);
    const tools = createWorkspaceKnowledgeAgentTools(dependencies(search));

    await expect(
      executeTool(tools.search_workspace, queries, {
        requestContext: requestContext("10000000-0000-4000-8000-000000000077"),
        writer: { custom },
      }),
    ).resolves.toMatchObject({ status: "unavailable", evidence: [] });
    expect(custom).not.toHaveBeenCalled();
  });

  it("treats a Workspace with no ready generation as unavailable without searching", async () => {
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => result);
    const tools = createWorkspaceKnowledgeAgentTools({
      open: vi.fn(async () => null),
      search,
    });
    await expect(
      executeTool(tools.search_workspace, queries, {
        requestContext: requestContext("10000000-0000-4000-8000-000000000078"),
      }),
    ).resolves.toMatchObject({
      status: "unavailable",
      control: { stopReason: "unavailable" },
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("rejects a content-only digest for canonical Agent Evidence", async () => {
    const contentOnlyDigest = createHash("sha256")
      .update(JSON.stringify(result.evidence[0]?.content))
      .digest("hex");
    const search: KnowledgeToolDependencies["search"] = vi.fn(async () => ({
      ...result,
      evidence: result.evidence.map((evidence) => ({
        ...evidence,
        contentHash: contentOnlyDigest,
      })),
    }));
    const tools = createWorkspaceKnowledgeAgentTools(dependencies(search));
    await expect(
      executeTool(tools.search_workspace, queries, {
        requestContext: requestContext("10000000-0000-4000-8000-000000000099"),
      }),
    ).rejects.toThrow("knowledge_evidence_integrity_failed");
  });
});
