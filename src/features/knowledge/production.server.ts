import "server-only";

import { SpanStatusCode } from "@opentelemetry/api";
import type { Actor } from "@/features/identity/types";
import { applicationTracer } from "@/observability/tracing.server";
import { createBailianEmbeddingPort, createBailianRerankPort } from "./bailian";
import { knowledgeEnvironment } from "./config";
import type { KnowledgeSearchQueries, SearchCorpusSnapshot } from "./ports";
import { searchWorkspaceKnowledgeWithDependencies } from "./search";
import { createKnowledgeStore } from "./store.server";
import { createStratumindExactRrfPort } from "./stratumind";

export async function searchWorkspaceKnowledge(input: {
  actor: Actor;
  workspaceId: string;
  query: string | KnowledgeSearchQueries;
  snapshot?: SearchCorpusSnapshot;
  signal?: AbortSignal;
}) {
  const environment = knowledgeEnvironment();
  if (!environment.indexingEnabled) throw new Error("knowledge_search_disabled");
  return applicationTracer.startActiveSpan(
    "knowledge.workspace.search",
    {
      attributes: {
        "gen_ai.provider.name": "dashscope",
        "spectra.knowledge.embedding_model": environment.embedding.model,
        "spectra.knowledge.rerank_model": environment.rerank.model,
        "spectra.workspace.id": input.workspaceId,
      },
    },
    async (span) => {
      const startedAt = Date.now();
      try {
        const result = await searchWorkspaceKnowledgeWithDependencies(input, {
          embedding: createBailianEmbeddingPort({
            apiKey: environment.dashscope.apiKey,
            baseUrl: environment.dashscope.baseUrl,
            model: environment.embedding.model,
            dimension: environment.embedding.dimension,
          }),
          exactRrf: createStratumindExactRrfPort({
            url: environment.stratumind.url,
            ...(environment.stratumind.apiKey ? { apiKey: environment.stratumind.apiKey } : {}),
          }),
          rerank: createBailianRerankPort({
            apiKey: environment.dashscope.apiKey,
            url: environment.rerank.url,
            model: environment.rerank.model,
            timeoutMs: environment.rerank.timeoutMs,
          }),
          store: createKnowledgeStore(),
        });
        span.setAttributes({
          "spectra.duration_ms": Date.now() - startedAt,
          "spectra.knowledge.candidate_count": result.diagnostics.candidateCount,
          "spectra.knowledge.evidence_count": result.evidence.length,
          "spectra.knowledge.status": result.status,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        if (input.signal?.aborted) {
          span.setAttribute("spectra.failure.code", "knowledge_search_aborted");
          span.setStatus({ code: SpanStatusCode.ERROR, message: "knowledge_search_aborted" });
          throw input.signal.reason;
        }
        if (
          error instanceof Error &&
          [
            "knowledge_index_not_ready",
            "knowledge_embedding_unavailable",
            "knowledge_stratumind_unavailable",
          ].includes(error.message)
        ) {
          span.setAttributes({
            "spectra.duration_ms": Date.now() - startedAt,
            "spectra.knowledge.candidate_count": 0,
            "spectra.knowledge.evidence_count": 0,
            "spectra.knowledge.status": "unavailable",
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return {
            status: "unavailable",
            candidates: [],
            evidence: [],
            degradedReasons: [],
            guarantee: null,
            diagnostics: { candidateCount: 0, packedCapacityUnits: 0 },
          } as const;
        }
        span.setAttributes({
          "spectra.duration_ms": Date.now() - startedAt,
          "spectra.failure.code": "knowledge_search_failed",
        });
        span.setStatus({ code: SpanStatusCode.ERROR, message: "knowledge_search_failed" });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export async function openWorkspaceKnowledgeSearch(input: {
  actor: Actor;
  workspaceId: string;
}): Promise<SearchCorpusSnapshot | null> {
  const environment = knowledgeEnvironment();
  if (!environment.indexingEnabled) throw new Error("knowledge_search_disabled");
  try {
    return await createKnowledgeStore().authorizeAndSnapshot(input.actor, input.workspaceId);
  } catch (error) {
    if (error instanceof Error && error.message === "knowledge_index_not_ready") return null;
    throw error;
  }
}
