import type { SourcePresentationHint } from "@/features/sources/presentation";

type NormalizedBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type EvidenceLocator =
  | { kind: "text_range"; start: number; end: number }
  | {
      kind: "page_region";
      pageIndex: number;
      boxes: NormalizedBox[];
      rotation?: number | undefined;
    }
  | {
      kind: "page_regions";
      regions: Array<{
        pageIndex: number;
        boxes: NormalizedBox[];
        rotation?: number | undefined;
      }>;
      anchor?: string | undefined;
    }
  | { kind: "grid_range"; sheetId: string; range: string }
  | {
      kind: "structured_path";
      dialect: "json-pointer" | "yaml-path" | "xml-path" | "html-path";
      path: string;
      start?: number | undefined;
      end?: number | undefined;
    }
  | { kind: "cue_range"; cueIds: string[]; startMs: number; endMs: number }
  | { kind: "media_range"; startMs: number; endMs: number; region?: NormalizedBox | undefined }
  | { kind: "notebook_cell"; cellId: string; start: number; end: number }
  | {
      kind: "code_range";
      startByte: number;
      endByte: number;
      startLine: number;
      endLine: number;
    };

export type EvidenceContent =
  | { kind: "exact_text"; text: string }
  | {
      kind: "table_cells";
      cells: Array<{
        address: string;
        value: string;
        displayValue?: string | undefined;
        formula?: string | undefined;
        rowSpan?: number | undefined;
        colSpan?: number | undefined;
      }>;
    }
  | {
      kind: "visual_region";
      accessibleDescription?: string | undefined;
      /**
       * Stable server-side location of the original visual asset. Clients never use this value
       * to construct a storage request; visual assets are always resolved from Evidence identity.
       */
      asset?:
        | { kind: "source_original" }
        | { kind: "ingestion_archive_entry"; path: string }
        | undefined;
    }
  | {
      kind: "timed_transcript";
      text: string;
      fidelity: "source-caption" | "asr" | "model-description";
    };

export type EvidenceFidelity = "source" | "ocr" | "asr" | "model-description";
export type RepresentationFamily =
  | "prose"
  | "paged"
  | "grid"
  | "structured"
  | "notebook"
  | "code"
  | "timed-text"
  | "timed-media"
  | "image";

export type RepresentationBlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "code"
  | "quote"
  | "thematic_break"
  | "structured_node"
  | "notebook_cell"
  | "cue"
  | "media_segment"
  | "visual";

export type RepresentationBlock = {
  id: string;
  representationId: string;
  ordinal: number;
  kind: RepresentationBlockKind;
  headingPath: string[];
  exactText: string | null;
  indexText: string | null;
  locator: EvidenceLocator;
  content: EvidenceContent;
  fidelity: EvidenceFidelity;
  contentHash: string;
  capacityUnits: number;
};

export type KnowledgeChunk = {
  id: string;
  representationId: string;
  ordinal: number;
  firstBlockOrdinal: number;
  lastBlockOrdinal: number;
  headingPath: string[];
  exactText: string;
  indexText: string;
  contentHash: string;
  capacityUnits: number;
};

export type EvidenceUnit = {
  id: string;
  representationId: string;
  ordinal: number;
  blockOrdinal: number;
  exactExcerpt: string | null;
  locator: EvidenceLocator;
  content: EvidenceContent;
  fidelity: EvidenceFidelity;
  contentHash: string;
  capacityUnits: number;
};

export type KnowledgeProjection = {
  representationId: string;
  blocks: RepresentationBlock[];
  chunks: KnowledgeChunk[];
  evidenceUnits: EvidenceUnit[];
};

export type ExactRrfGuarantee = {
  scope: string;
  orderedTopKExact: true;
  tieBreak: "point-identity-ascending";
  channelInput: string;
};

export type KnowledgeWorkspaceRelation = "current" | "referenced";

type SearchCandidate = {
  chunkId: string;
  sourceId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceRelation: KnowledgeWorkspaceRelation;
  sourceRevision: number;
  representationId: string;
  rank: number;
  retrievalRank: number;
  rerankScore: number | null;
  contextView: string;
  contentHash: string;
};

export type PackedEvidenceUnit = EvidenceUnit & {
  sourceId: string;
  sourceName?: string;
  sourcePresentation?: SourcePresentationHint;
  workspaceId: string;
  workspaceName: string;
  workspaceRelation: KnowledgeWorkspaceRelation;
  sourceRevision: number;
  representationHash: string;
};

export type WorkspaceKnowledgeSearchResult = {
  status: "ok" | "degraded";
  candidates: SearchCandidate[];
  evidence: PackedEvidenceUnit[];
  degradedReasons: Array<"rerank_failed">;
  guarantee: ExactRrfGuarantee;
  diagnostics: {
    candidateCount: number;
    packedCapacityUnits: number;
  };
};
