import type { Actor } from "@/features/identity/types";
import type { SourcePresentationHint } from "@/features/sources/presentation";
import type {
  EvidenceUnit,
  ExactRrfGuarantee,
  KnowledgeChunk,
  KnowledgeWorkspaceRelation,
  RepresentationBlock,
} from "./contracts";

export type KnowledgeSearchQueries = {
  intentQuery: string;
  denseQuery: string;
  sparseQuery: string;
  rerankQuery: string;
};

export type EmbeddingPort = {
  embed(texts: readonly string[], signal?: AbortSignal): Promise<number[][]>;
};

export type ExactRrfPort = {
  query(input: {
    collection: string;
    dense: number[];
    sparseText: string;
    manifestHash: string;
    generationIds: string[];
    workspaceIds: string[];
    k: number;
    weights: [number, number];
    limit: number;
    signal?: AbortSignal;
  }): Promise<{
    points: Array<{ id: string; rank: number; version: number }>;
    guarantee: ExactRrfGuarantee;
    execution?: unknown;
  }>;
};

export type RerankPort = {
  rerank(input: {
    query: string;
    documents: Array<{ id: string; text: string }>;
    signal?: AbortSignal;
  }): Promise<Array<{ id: string; score: number }>>;
};

export type SearchCorpusSnapshot = {
  collection: string;
  manifestHash: string;
  generationIds: string[];
  referenceSourceIds: string[];
  rootWorkspaceId: string;
  workspaceIds: string[];
};

type SearchMaterial = {
  sourceId: string;
  sourceName?: string;
  sourcePresentation?: SourcePresentationHint;
  workspaceId: string;
  workspaceName: string;
  workspaceRelation: KnowledgeWorkspaceRelation;
  sourceRevision: number;
  representationHash: string;
  chunk: KnowledgeChunk;
  blocks: RepresentationBlock[];
  evidence: EvidenceUnit[];
};

export type KnowledgeStorePort = {
  authorizeAndSnapshot(actor: Actor, workspaceId: string): Promise<SearchCorpusSnapshot>;
  loadMaterials(input: {
    chunkIds: readonly string[];
    generationIds: readonly string[];
    rootWorkspaceId: string;
  }): Promise<Map<string, SearchMaterial>>;
};
