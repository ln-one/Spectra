import type { Actor } from "@/features/identity/types";
import { buildContextView, packEvidence } from "./context";
import type { WorkspaceKnowledgeSearchResult } from "./contracts";
import type {
  EmbeddingPort,
  ExactRrfPort,
  KnowledgeSearchQueries,
  KnowledgeStorePort,
  RerankPort,
  SearchCorpusSnapshot,
} from "./ports";
import { type KnowledgeProfile, knowledgeProfileV1 } from "./profile";

export type WorkspaceKnowledgeSearchDependencies = {
  embedding: EmbeddingPort;
  exactRrf: ExactRrfPort;
  rerank: RerankPort;
  store: KnowledgeStorePort;
  profile?: KnowledgeProfile;
};

function mixDense(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length)
    throw new Error("knowledge_embedding_shape");
  return left.map((value, index) => {
    const other = right[index];
    if (other === undefined || !Number.isFinite(value) || !Number.isFinite(other))
      throw new Error("knowledge_embedding_invalid");
    return 0.5 * value + 0.5 * other;
  });
}

function validateExactResponse(
  response: Awaited<ReturnType<ExactRrfPort["query"]>>,
  limit: number,
) {
  if (
    response.guarantee.orderedTopKExact !== true ||
    response.guarantee.tieBreak !== "point-identity-ascending" ||
    response.points.length > limit ||
    response.points.some((point, index) => point.rank !== index + 1)
  ) {
    throw new Error("knowledge_exact_rrf_contract");
  }
  if (new Set(response.points.map((point) => point.id)).size !== response.points.length) {
    throw new Error("knowledge_exact_rrf_contract");
  }
}

function normalizeQueries(query: string | KnowledgeSearchQueries): KnowledgeSearchQueries {
  if (typeof query === "string") {
    const normalized = query.trim();
    if (!normalized) throw new Error("knowledge_query_empty");
    return {
      intentQuery: normalized,
      denseQuery: normalized,
      sparseQuery: normalized,
      rerankQuery: normalized,
    };
  }
  const normalized = {
    intentQuery: query.intentQuery.trim(),
    denseQuery: query.denseQuery.trim(),
    sparseQuery: query.sparseQuery.trim(),
    rerankQuery: query.rerankQuery.trim(),
  };
  if (Object.values(normalized).some((value) => !value)) {
    throw new Error("knowledge_query_empty");
  }
  return normalized;
}

function assertPinnedScopeAuthorized(
  pinned: SearchCorpusSnapshot,
  authorized: SearchCorpusSnapshot,
) {
  const authorizedWorkspaceIds = new Set(authorized.workspaceIds);
  const authorizedReferenceSourceIds = new Set(authorized.referenceSourceIds);
  if (
    pinned.rootWorkspaceId !== authorized.rootWorkspaceId ||
    pinned.workspaceIds.some((workspaceId) => !authorizedWorkspaceIds.has(workspaceId)) ||
    pinned.referenceSourceIds.some((sourceId) => !authorizedReferenceSourceIds.has(sourceId))
  ) {
    throw new Error("knowledge_search_scope_stale");
  }
}

export async function searchWorkspaceKnowledgeWithDependencies(
  input: {
    actor: Actor;
    workspaceId: string;
    query: string | KnowledgeSearchQueries;
    snapshot?: SearchCorpusSnapshot;
    signal?: AbortSignal;
  },
  dependencies: WorkspaceKnowledgeSearchDependencies,
): Promise<WorkspaceKnowledgeSearchResult> {
  const queries = normalizeQueries(input.query);
  const profile = dependencies.profile ?? knowledgeProfileV1;
  const authorizedSnapshot = await dependencies.store.authorizeAndSnapshot(
    input.actor,
    input.workspaceId,
  );
  // A server-owned session may pin the first authorized corpus view. Authorization is still
  // rechecked on every search; only the ready-generation membership stays stable for the turn.
  const snapshot = input.snapshot ?? authorizedSnapshot;
  if (input.snapshot) assertPinnedScopeAuthorized(input.snapshot, authorizedSnapshot);
  const degradedReasons: WorkspaceKnowledgeSearchResult["degradedReasons"] = [];

  const vectors = await dependencies.embedding.embed(
    [queries.intentQuery, queries.denseQuery],
    input.signal,
  );
  const left = vectors[0];
  const right = vectors[1];
  if (!left || !right || vectors.length !== 2) throw new Error("knowledge_embedding_shape");
  const exact = await dependencies.exactRrf.query({
    collection: snapshot.collection,
    dense: mixDense(left, right),
    sparseText: queries.sparseQuery,
    manifestHash: snapshot.manifestHash,
    generationIds: snapshot.generationIds,
    workspaceIds: snapshot.workspaceIds,
    k: profile.retrieval.wrrfK,
    weights: profile.retrieval.weights,
    limit: profile.retrieval.candidateLimit,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  validateExactResponse(exact, profile.retrieval.candidateLimit);
  const materials = await dependencies.store.loadMaterials({
    chunkIds: exact.points.map((point) => point.id),
    generationIds: snapshot.generationIds,
    rootWorkspaceId: snapshot.rootWorkspaceId,
  });
  const candidates = exact.points.map((point) => {
    const material = materials.get(point.id);
    if (!material) throw new Error("knowledge_material_missing");
    return {
      point,
      material,
      contextView: buildContextView({
        chunk: material.chunk,
        blocks: material.blocks,
        maxUnits: profile.context.maxUnits,
      }),
    };
  });

  let rerankScores = new Map<string, number>();
  let reranked = candidates;
  try {
    const uniqueByText = new Map<string, { id: string; text: string }>();
    for (const candidate of candidates) {
      if (!uniqueByText.has(candidate.contextView)) {
        uniqueByText.set(candidate.contextView, {
          id: candidate.material.chunk.id,
          text: candidate.contextView,
        });
      }
    }
    const documents = [...uniqueByText.values()];
    const ranking = await dependencies.rerank.rerank({
      query: queries.rerankQuery,
      documents,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (
      ranking.length !== documents.length ||
      new Set(ranking.map((item) => item.id)).size !== documents.length
    ) {
      throw new Error("invalid rerank");
    }
    const representativeByText = new Map(documents.map((document) => [document.text, document.id]));
    const representativeScores = new Map(ranking.map((item) => [item.id, item.score]));
    rerankScores = new Map(
      candidates.map((candidate) => {
        const representative = representativeByText.get(candidate.contextView);
        const score = representative ? representativeScores.get(representative) : undefined;
        if (score === undefined) throw new Error("invalid rerank");
        return [candidate.material.chunk.id, score];
      }),
    );
    const order = new Map(ranking.map((item, index) => [item.id, index]));
    reranked = [...candidates].sort(
      (leftCandidate, rightCandidate) =>
        (order.get(representativeByText.get(leftCandidate.contextView) ?? "") ??
          Number.MAX_SAFE_INTEGER) -
        (order.get(representativeByText.get(rightCandidate.contextView) ?? "") ??
          Number.MAX_SAFE_INTEGER),
    );
  } catch {
    if (input.signal?.aborted) throw input.signal.reason;
    degradedReasons.push("rerank_failed");
  }
  const output = reranked.slice(0, profile.retrieval.outputLimit);
  const packed = packEvidence(
    output.map(({ material }) => ({
      sourceId: material.sourceId,
      ...(material.sourceName ? { sourceName: material.sourceName } : {}),
      ...(material.sourcePresentation ? { sourcePresentation: material.sourcePresentation } : {}),
      workspaceId: material.workspaceId,
      workspaceName: material.workspaceName,
      workspaceRelation: material.workspaceRelation,
      sourceRevision: material.sourceRevision,
      representationHash: material.representationHash,
      chunk: material.chunk,
      evidence: material.evidence,
    })),
    profile.packing,
  );
  return {
    status: degradedReasons.length > 0 ? "degraded" : "ok",
    candidates: output.map(({ point, material, contextView }, index) => ({
      chunkId: material.chunk.id,
      sourceId: material.sourceId,
      workspaceId: material.workspaceId,
      workspaceName: material.workspaceName,
      workspaceRelation: material.workspaceRelation,
      sourceRevision: material.sourceRevision,
      representationId: material.chunk.representationId,
      rank: index + 1,
      retrievalRank: point.rank,
      rerankScore: rerankScores.get(material.chunk.id) ?? null,
      contextView,
      contentHash: material.chunk.contentHash,
    })),
    evidence: packed.evidence,
    degradedReasons,
    guarantee: exact.guarantee,
    diagnostics: {
      candidateCount: candidates.length,
      packedCapacityUnits: packed.usedCapacityUnits,
    },
  };
}
