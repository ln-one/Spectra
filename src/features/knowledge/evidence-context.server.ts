import "server-only";

import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { type Database, database } from "@/database/client";
import {
  retrievalEvidenceUnits,
  retrievalIndexGenerations,
  retrievalRepresentationBlocks,
  sources,
} from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import type { KnowledgeEvidenceContext } from "./evidence-context";
import type { SearchCorpusSnapshot } from "./ports";
import { createKnowledgeStore } from "./store.server";

const MAX_CONTEXT_CHARACTERS = 1_200;
const CONTEXT_BLOCK_RADIUS = 8;
const CONTEXT_SEPARATOR = "\n\n";

type ContextBlock = {
  ordinal: number;
  headingPath: string[];
  exactText: string | null;
};

type EvidenceContextRow = {
  evidenceId: string;
  generationId: string;
  representationId: string;
  blockOrdinal: number;
  exactExcerpt: string;
};

export class KnowledgeEvidenceContextUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("knowledge_evidence_context_unavailable", options);
    this.name = "KnowledgeEvidenceContextUnavailableError";
  }
}

function sameHeadingPath(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function uniqueExcerptStart(text: string, exactExcerpt: string) {
  const first = text.indexOf(exactExcerpt);
  if (first < 0) return -1;
  return text.indexOf(exactExcerpt, first + 1) < 0 ? first : -1;
}

function clipStart(text: string, limit: number) {
  if (text.length <= limit) return text;
  if (limit <= 1) return "…".slice(0, limit);
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function clipEnd(text: string, limit: number) {
  if (text.length <= limit) return text;
  if (limit <= 1) return "…".slice(0, limit);
  return `…${text.slice(text.length - limit + 1).trimStart()}`;
}

function clipHitAroundExcerpt(hitText: string, exactExcerpt: string) {
  const excerptStart = uniqueExcerptStart(hitText, exactExcerpt);
  if (hitText.length <= MAX_CONTEXT_CHARACTERS) {
    return {
      text: hitText,
      highlight:
        excerptStart >= 0 ? { start: excerptStart, end: excerptStart + exactExcerpt.length } : null,
    };
  }
  if (excerptStart < 0 || exactExcerpt.length >= MAX_CONTEXT_CHARACTERS) {
    return { text: clipStart(hitText, MAX_CONTEXT_CHARACTERS), highlight: null };
  }

  const excerptEnd = excerptStart + exactExcerpt.length;
  const available = MAX_CONTEXT_CHARACTERS - exactExcerpt.length;
  const desiredBefore = Math.ceil(available / 2);
  const start = Math.max(
    0,
    Math.min(excerptStart - desiredBefore, hitText.length - MAX_CONTEXT_CHARACTERS),
  );
  const end = Math.min(hitText.length, start + MAX_CONTEXT_CHARACTERS);
  const hasPrefix = start > 0 && start < excerptStart;
  const hasSuffix = end < hitText.length && end > excerptEnd;
  const visibleStart = start + (hasPrefix ? 1 : 0);
  const visibleEnd = end - (hasSuffix ? 1 : 0);
  const raw = hitText.slice(visibleStart, visibleEnd);
  const text = `${hasPrefix ? "…" : ""}${raw}${hasSuffix ? "…" : ""}`;
  const highlightStart = (hasPrefix ? 1 : 0) + excerptStart - visibleStart;
  return {
    text,
    highlight: { start: highlightStart, end: highlightStart + exactExcerpt.length },
  };
}

export function buildKnowledgeEvidenceContext(input: {
  evidenceId: string;
  exactExcerpt: string;
  hitBlockOrdinal: number;
  blocks: readonly ContextBlock[];
}): KnowledgeEvidenceContext {
  const ordered = [...input.blocks].sort((left, right) => left.ordinal - right.ordinal);
  const hitIndex = ordered.findIndex((block) => block.ordinal === input.hitBlockOrdinal);
  const hit = ordered[hitIndex];
  const hitText = hit?.exactText?.trim();
  if (!hit || !hitText) throw new KnowledgeEvidenceContextUnavailableError();

  let before: string | null = null;
  for (let index = hitIndex - 1; index >= 0; index -= 1) {
    const candidate = ordered[index];
    if (!candidate || !sameHeadingPath(candidate.headingPath, hit.headingPath)) break;
    const text = candidate.exactText?.trim();
    if (text) {
      before = text;
      break;
    }
  }

  let after: string | null = null;
  for (let index = hitIndex + 1; index < ordered.length; index += 1) {
    const candidate = ordered[index];
    if (!candidate || !sameHeadingPath(candidate.headingPath, hit.headingPath)) break;
    const text = candidate.exactText?.trim();
    if (text) {
      after = text;
      break;
    }
  }

  const clippedHit = clipHitAroundExcerpt(hitText, input.exactExcerpt);
  if (clippedHit.text.length >= MAX_CONTEXT_CHARACTERS) {
    return {
      evidenceId: input.evidenceId,
      contextText: clippedHit.text,
      exactExcerpt: input.exactExcerpt,
      highlight: clippedHit.highlight,
    };
  }

  const separatorCount = Number(Boolean(before)) + Number(Boolean(after));
  const availableForNeighbors = Math.max(
    0,
    MAX_CONTEXT_CHARACTERS - clippedHit.text.length - separatorCount * CONTEXT_SEPARATOR.length,
  );
  let beforeBudget = before ? Math.floor(availableForNeighbors / 2) : 0;
  let afterBudget = after ? availableForNeighbors - beforeBudget : 0;
  if (!before) afterBudget = availableForNeighbors;
  if (!after) beforeBudget = availableForNeighbors;
  if (before && before.length < beforeBudget) {
    afterBudget += beforeBudget - before.length;
    beforeBudget = before.length;
  }
  if (after && after.length < afterBudget) {
    beforeBudget += afterBudget - after.length;
    afterBudget = after.length;
  }

  const beforeText = before && beforeBudget > 0 ? clipEnd(before, beforeBudget) : null;
  const afterText = after && afterBudget > 0 ? clipStart(after, afterBudget) : null;
  const parts = [beforeText, clippedHit.text, afterText].filter((part): part is string =>
    Boolean(part),
  );
  const hitPartIndex = beforeText ? 1 : 0;
  const hitOffset =
    parts.slice(0, hitPartIndex).reduce((total, part) => total + part.length, 0) +
    hitPartIndex * CONTEXT_SEPARATOR.length;

  return {
    evidenceId: input.evidenceId,
    contextText: parts.join(CONTEXT_SEPARATOR),
    exactExcerpt: input.exactExcerpt,
    highlight: clippedHit.highlight
      ? {
          start: hitOffset + clippedHit.highlight.start,
          end: hitOffset + clippedHit.highlight.end,
        }
      : null,
  };
}

async function loadEvidenceContextRow(
  evidenceId: string,
  db: Database,
): Promise<EvidenceContextRow> {
  const [row] = await db
    .select({
      evidenceId: retrievalEvidenceUnits.id,
      generationId: retrievalIndexGenerations.id,
      representationId: retrievalEvidenceUnits.representationId,
      blockOrdinal: retrievalEvidenceUnits.blockOrdinal,
      exactExcerpt: retrievalEvidenceUnits.exactExcerpt,
    })
    .from(retrievalEvidenceUnits)
    .innerJoin(
      retrievalIndexGenerations,
      eq(retrievalEvidenceUnits.indexGenerationId, retrievalIndexGenerations.id),
    )
    .innerJoin(sources, eq(retrievalEvidenceUnits.sourceId, sources.id))
    .where(
      and(
        eq(retrievalEvidenceUnits.id, evidenceId),
        eq(retrievalIndexGenerations.state, "ready"),
        isNull(sources.deletedAt),
      ),
    )
    .limit(1);
  if (!row?.exactExcerpt) throw new KnowledgeEvidenceContextUnavailableError();
  return { ...row, exactExcerpt: row.exactExcerpt };
}

async function loadContextBlocks(row: EvidenceContextRow, db: Database) {
  return db
    .select({
      ordinal: retrievalRepresentationBlocks.ordinal,
      headingPath: retrievalRepresentationBlocks.headingPath,
      exactText: retrievalRepresentationBlocks.exactText,
    })
    .from(retrievalRepresentationBlocks)
    .where(
      and(
        eq(retrievalRepresentationBlocks.indexGenerationId, row.generationId),
        eq(retrievalRepresentationBlocks.representationId, row.representationId),
        gte(
          retrievalRepresentationBlocks.ordinal,
          Math.max(0, row.blockOrdinal - CONTEXT_BLOCK_RADIUS),
        ),
        lte(retrievalRepresentationBlocks.ordinal, row.blockOrdinal + CONTEXT_BLOCK_RADIUS),
      ),
    )
    .orderBy(asc(retrievalRepresentationBlocks.ordinal));
}

export async function readAuthorizedKnowledgeEvidenceContext(input: {
  actor: Actor;
  workspaceId: string;
  evidenceId: string;
  db?: Database;
}) {
  const db = input.db ?? database;
  let snapshot: SearchCorpusSnapshot;
  try {
    snapshot = await createKnowledgeStore(db).authorizeAndSnapshot(input.actor, input.workspaceId);
  } catch (error) {
    if (
      error instanceof Error &&
      ["knowledge_workspace_not_found", "knowledge_index_not_ready"].includes(error.message)
    ) {
      throw new KnowledgeEvidenceContextUnavailableError({ cause: error });
    }
    throw error;
  }
  const row = await loadEvidenceContextRow(input.evidenceId, db);
  if (!snapshot.generationIds.includes(row.generationId)) {
    throw new KnowledgeEvidenceContextUnavailableError();
  }
  return buildKnowledgeEvidenceContext({
    evidenceId: row.evidenceId,
    exactExcerpt: row.exactExcerpt,
    hitBlockOrdinal: row.blockOrdinal,
    blocks: await loadContextBlocks(row, db),
  });
}
