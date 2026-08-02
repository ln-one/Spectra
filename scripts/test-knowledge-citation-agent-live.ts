import { randomUUID } from "node:crypto";
import { toAISdkStream } from "@mastra/ai-sdk";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { loadEnvConfig } from "@next/env";
import { serverEnvironment } from "@/environment/server";
import type { WorkspaceKnowledgeSearchResult } from "@/features/knowledge/contracts";
import { knowledgeStructuredContentHash } from "@/features/knowledge/integrity";

loadEnvConfig(process.cwd());

async function main() {
  const [
    { createWorkspaceAgentResources, workspaceAgentProfile },
    agentServer,
    knowledgeTool,
    turnPolicy,
  ] = await Promise.all([
    import("@/features/agents/config"),
    import("@/features/agents/server"),
    import("@/features/agents/knowledge-tool.server"),
    import("@/features/agents/workspace-agent-turn-policy"),
  ]);

  const excerpt =
    "假设坐标原点位于左下角点则像素由其左下角坐标表示实区域填充算法（1/9）解决的主要问题是什么？– 确定待填充的像素– 即检查光栅屏幕上的每一像素是否位于多边形区域内";
  const evidenceId = "79cfe9a0-b1f4-51d7-a6fb-43df5273c6ac";
  const sourceId = randomUUID();
  const sourceWorkspaceId = randomUUID();
  const representationId = randomUUID();
  const searchResult: WorkspaceKnowledgeSearchResult = {
    status: "ok",
    candidates: [],
    evidence: [
      {
        id: evidenceId,
        sourceId,
        sourceName: "第3章 基本图形生成算法2-20251010.pdf",
        workspaceId: sourceWorkspaceId,
        workspaceName: "计算机图形学",
        workspaceRelation: "referenced",
        sourceRevision: 1,
        representationHash: "a".repeat(64),
        representationId,
        ordinal: 0,
        blockOrdinal: 0,
        exactExcerpt: excerpt,
        locator: { kind: "text_range", start: 116, end: 198 },
        content: { kind: "exact_text", text: excerpt },
        fidelity: "source",
        contentHash: knowledgeStructuredContentHash({
          content: { kind: "exact_text", text: excerpt },
          fidelity: "source",
          locator: { kind: "text_range", start: 116, end: 198 },
        }),
        capacityUnits: Array.from(excerpt).length,
      },
    ],
    degradedReasons: [],
    guarantee: {
      scope: "selected-local-shards-frozen-segment-view",
      orderedTopKExact: true,
      tieBreak: "point-identity-ascending",
      channelInput: "native-exact-rank-streams",
    },
    diagnostics: { candidateCount: 10, packedCapacityUnits: Array.from(excerpt).length },
  };

  const tools = knowledgeTool.createWorkspaceKnowledgeAgentTools({
    open: async () => ({
      collection: "knowledge-v1",
      manifestHash: "b".repeat(64),
      generationIds: [randomUUID()],
      referenceSourceIds: [],
      rootWorkspaceId: sourceWorkspaceId,
      workspaceIds: [sourceWorkspaceId],
    }),
    search: async () => searchResult,
  });
  const { model } = createWorkspaceAgentResources(serverEnvironment());
  const agent = new Agent({
    id: "knowledge-citation-live-contract",
    name: "Knowledge citation live contract",
    hooks: knowledgeTool.workspaceKnowledgeToolHooks,
    instructions: ({ requestContext }) =>
      `${agentServer.workspaceAgentInstructions({
        artifactCreationCapabilities: new Set(["presentation", "animation"]),
        requestContext,
      })} ${agentServer.KNOWLEDGE_AGENT_INSTRUCTIONS}`,
    maxRetries: 0,
    model,
    tools,
  });
  const workspaceId = randomUUID();
  const requestContext = new RequestContext([
    ["actor", { principalId: randomUUID(), handle: "citation-live" }],
    ["conversationId", randomUUID()],
    ["latestUserMessage", "根据工作区资料，实区域填充算法主要解决什么问题？"],
    ["locale", "zh-CN"],
    ["rootRunId", randomUUID()],
    ["sourceUserMessageId", "user:citation-live"],
    ["surface", { type: "studio" }],
    ["workspaceId", workspaceId],
  ]);
  const output = await agent.stream("根据工作区资料，实区域填充算法主要解决什么问题？", {
    maxSteps: workspaceAgentProfile.maxSteps,
    modelSettings: { maxOutputTokens: 512, temperature: 0 },
    onIterationComplete: knowledgeTool.knowledgeIterationControl,
    prepareStep: turnPolicy.prepareWorkspaceAgentStep,
    providerOptions: workspaceAgentProfile.providerOptions,
    requestContext,
    toolCallConcurrency: 1,
  });
  const chunks: unknown[] = [];
  for await (const chunk of toAISdkStream(output, {
    from: "agent",
    onError: () => "agent_unavailable",
    sendReasoning: false,
    version: "v6",
  })) {
    chunks.push(chunk);
  }
  const full = await output.getFullOutput();
  const evidencePart = chunks.find(
    (chunk) =>
      typeof chunk === "object" &&
      chunk !== null &&
      Reflect.get(chunk, "type") === "data-knowledgeEvidence",
  );
  if (!evidencePart) {
    throw new Error(
      `knowledge_citation_data_part_missing:${JSON.stringify({
        chunkTypes: chunks.flatMap((chunk) =>
          chunk && typeof chunk === "object" ? [Reflect.get(chunk, "type")] : [],
        ),
        toolCalls: full.toolCalls.map((call) => call.payload.toolName),
        text: full.text,
      })}`,
    );
  }
  const data = Reflect.get(evidencePart, "data");
  const streamedEvidence =
    typeof data === "object" && data !== null && Array.isArray(Reflect.get(data, "evidence"))
      ? Reflect.get(data, "evidence")[0]
      : null;
  const citationToken =
    typeof streamedEvidence === "object" && streamedEvidence !== null
      ? Reflect.get(streamedEvidence, "citationToken")
      : null;
  if (typeof citationToken !== "string") throw new Error("knowledge_citation_token_missing");
  const expectedCitation = `#knowledge-evidence-${citationToken}`;
  if (!full.text.includes(expectedCitation)) {
    throw new Error(
      `knowledge_inline_citation_missing:${JSON.stringify({
        expectedCitation,
        toolCalls: full.toolCalls.map((call) => ({
          args: call.payload.args,
          name: call.payload.toolName,
        })),
      })}`,
    );
  }
  if (full.text.includes("[^")) throw new Error("knowledge_raw_footnote_exposed");
  if (full.text.includes(evidenceId)) throw new Error("knowledge_evidence_uuid_exposed");
  if (!full.toolCalls.some((call) => call.payload.toolName === "search_workspace")) {
    throw new Error("knowledge_search_tool_call_missing");
  }

  console.log(
    JSON.stringify(
      {
        answer: full.text,
        hasEvidencePart: true,
        citationToken,
        evidence: searchResult.evidence.map((unit) => ({
          evidenceId: unit.id,
          sourceName: unit.sourceName,
          exactExcerpt: unit.exactExcerpt,
          locator: unit.locator,
          contentHash: unit.contentHash,
        })),
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "knowledge_citation_live_failed");
  process.exitCode = 1;
});
