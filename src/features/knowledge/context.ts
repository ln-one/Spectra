import type {
  EvidenceUnit,
  KnowledgeChunk,
  PackedEvidenceUnit,
  RepresentationBlock,
} from "./contracts";
import { knowledgeStructuredContentHash } from "./integrity";
import { countCapacityUnits, knowledgeProfileV1 } from "./profile";

const PACKED_EVIDENCE_NAMESPACE = "019f7f38-18f5-74e4-8eb0-377a09493388";

export function buildContextView(input: {
  chunk: KnowledgeChunk;
  blocks: RepresentationBlock[];
  maxUnits?: number;
}) {
  const maxUnits = input.maxUnits ?? knowledgeProfileV1.context.maxUnits;
  const byOrdinal = new Map(input.blocks.map((block) => [block.ordinal, block]));
  const selected = [
    byOrdinal.get(input.chunk.firstBlockOrdinal - 1),
    ...Array.from(
      {
        length: input.chunk.lastBlockOrdinal - input.chunk.firstBlockOrdinal + 1,
      },
      (_, index) => byOrdinal.get(input.chunk.firstBlockOrdinal + index),
    ),
    byOrdinal.get(input.chunk.lastBlockOrdinal + 1),
  ].filter(
    (block): block is RepresentationBlock =>
      block !== undefined && block.representationId === input.chunk.representationId,
  );
  const heading = input.chunk.headingPath.join(" > ");
  const before = selected.filter((block) => block.ordinal < input.chunk.firstBlockOrdinal);
  const target = selected.filter(
    (block) =>
      block.ordinal >= input.chunk.firstBlockOrdinal &&
      block.ordinal <= input.chunk.lastBlockOrdinal,
  );
  const after = selected.filter((block) => block.ordinal > input.chunk.lastBlockOrdinal);
  const render = (blocks: RepresentationBlock[]) =>
    blocks.map((block) => block.exactText).join("\n\n");
  const targetView = `<TARGET_CHUNK>\n\n${render(target)}\n\n</TARGET_CHUNK>`;
  if (countCapacityUnits(targetView) >= maxUnits) {
    return Array.from(targetView).slice(0, maxUnits).join("");
  }
  let remaining = maxUnits - countCapacityUnits(targetView);
  const takeStart = (text: string, limit: number) => Array.from(text).slice(0, limit).join("");
  const takeEnd = (text: string, limit: number) => Array.from(text).slice(-limit).join("");
  const headingView = heading ? `HEADING: ${heading}` : "";
  const boundedHeading = takeStart(headingView, Math.min(remaining, 256));
  remaining -= countCapacityUnits(boundedHeading);
  const beforeView = takeEnd(render(before), Math.floor(remaining / 2));
  remaining -= countCapacityUnits(beforeView);
  const afterView = takeStart(render(after), remaining);
  return [boundedHeading, beforeView, targetView, afterView].filter(Boolean).join("\n\n");
}

function evidenceForChunk(input: {
  sourceId: string;
  sourceName?: string;
  sourcePresentation?: PackedEvidenceUnit["sourcePresentation"];
  workspaceId: string;
  workspaceName: string;
  workspaceRelation: PackedEvidenceUnit["workspaceRelation"];
  sourceRevision: number;
  representationHash: string;
  chunk: KnowledgeChunk;
  evidence: EvidenceUnit[];
}): PackedEvidenceUnit[] {
  return input.evidence
    .filter(
      (unit) =>
        unit.representationId === input.chunk.representationId &&
        unit.blockOrdinal >= input.chunk.firstBlockOrdinal &&
        unit.blockOrdinal <= input.chunk.lastBlockOrdinal,
    )
    .map((unit) => ({
      ...unit,
      sourceId: input.sourceId,
      ...(input.sourceName ? { sourceName: input.sourceName } : {}),
      ...(input.sourcePresentation ? { sourcePresentation: input.sourcePresentation } : {}),
      workspaceId: input.workspaceId,
      workspaceName: input.workspaceName,
      workspaceRelation: input.workspaceRelation,
      sourceRevision: input.sourceRevision,
      representationHash: input.representationHash,
    }));
}

export function packEvidence(
  candidates: Array<{
    sourceId: string;
    sourceName?: string;
    sourcePresentation?: PackedEvidenceUnit["sourcePresentation"];
    workspaceId: string;
    workspaceName: string;
    workspaceRelation: PackedEvidenceUnit["workspaceRelation"];
    sourceRevision: number;
    representationHash: string;
    chunk: KnowledgeChunk;
    evidence: EvidenceUnit[];
  }>,
  limits: {
    maxUnits: number;
    maxEvidenceUnits: number;
  } = knowledgeProfileV1.packing,
) {
  const ordered = candidates.flatMap(evidenceForChunk);
  const byIdentity = new Map<string, PackedEvidenceUnit>();
  for (const unit of ordered) byIdentity.set(`${unit.sourceId}:${unit.id}`, unit);
  const merged: PackedEvidenceUnit[] = [];
  let used = 0;
  for (const unit of byIdentity.values()) {
    if (merged.length >= limits.maxEvidenceUnits || used + unit.capacityUnits > limits.maxUnits)
      break;
    const previous = merged.at(-1);
    if (
      previous &&
      previous.sourceId === unit.sourceId &&
      previous.representationId === unit.representationId &&
      previous.locator.kind === "text_range" &&
      unit.locator.kind === "text_range" &&
      previous.exactExcerpt !== null &&
      unit.exactExcerpt !== null &&
      unit.locator.start < previous.locator.end
    ) {
      const overlap = Math.max(0, previous.locator.end - unit.locator.start);
      const suffix = unit.exactExcerpt.slice(overlap);
      previous.exactExcerpt += suffix;
      previous.locator.end = Math.max(previous.locator.end, unit.locator.end);
      previous.content = { kind: "exact_text", text: previous.exactExcerpt };
      previous.capacityUnits += countCapacityUnits(suffix);
      previous.contentHash = knowledgeStructuredContentHash({
        content: previous.content,
        fidelity: previous.fidelity,
        locator: previous.locator,
      });
      previous.id = uuidV5(
        [
          previous.sourceId,
          previous.sourceRevision,
          previous.representationId,
          previous.locator.start,
          previous.locator.end,
          previous.contentHash,
        ].join("\u001f"),
        PACKED_EVIDENCE_NAMESPACE,
      );
      used += countCapacityUnits(suffix);
      continue;
    }
    merged.push(structuredClone(unit));
    used += unit.capacityUnits;
  }
  return { evidence: merged, usedCapacityUnits: used };
}

import { v5 as uuidV5 } from "uuid";
