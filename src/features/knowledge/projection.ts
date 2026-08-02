import type { Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { v5 as uuidV5 } from "uuid";
import type {
  EvidenceContent,
  EvidenceFidelity,
  EvidenceLocator,
  EvidenceUnit,
  KnowledgeChunk,
  KnowledgeProjection,
  RepresentationBlock,
  RepresentationBlockKind,
} from "./contracts";
import { knowledgeContentHash, knowledgeStructuredContentHash } from "./integrity";
import { countCapacityUnits, type KnowledgeProfile, knowledgeProfileV1 } from "./profile";

const KNOWLEDGE_ID_NAMESPACE = "018f1bd8-cc45-7f80-a5b8-16b12074fd7b";

function knowledgeIdentity(...parts: Array<string | number>) {
  return uuidV5(parts.join("\u001f"), KNOWLEDGE_ID_NAMESPACE);
}

export type ProjectableBlock = {
  kind: RepresentationBlockKind;
  headingPath?: string[];
  exactText: string | null;
  indexText?: string | null;
  locator: EvidenceLocator;
  content?: EvidenceContent;
  fidelity?: EvidenceFidelity;
};

function blockIdentityLocator(locator: EvidenceLocator) {
  return JSON.stringify(locator);
}

function sentenceRanges(text: string, absoluteStart: number) {
  return Array.from(new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text))
    .map((sentence) => ({
      start: absoluteStart + sentence.index,
      end: absoluteStart + sentence.index + sentence.segment.length,
      text: sentence.segment,
    }))
    .filter((range) => range.text.trim().length > 0);
}

function splitOversizedTextBlock(block: ProjectableBlock, maxUnits: number): ProjectableBlock[] {
  const indexText = block.indexText === undefined ? block.exactText : block.indexText;
  if (indexText === null || block.exactText === null || countCapacityUnits(indexText) <= maxUnits) {
    return [block];
  }
  if (block.content?.kind === "table_cells") {
    return block.content.cells.flatMap((cell) => {
      const prefix = `${cell.address}: `;
      const suffix = cell.formula ? ` [=${cell.formula}]` : "";
      const value = cell.displayValue || cell.value || (cell.formula ? `=${cell.formula}` : "");
      const room = Math.max(1, maxUnits - countCapacityUnits(prefix) - countCapacityUnits(suffix));
      const characters = Array.from(value);
      return Array.from({ length: Math.ceil(characters.length / room) }, (_, index) => {
        const part = characters.slice(index * room, (index + 1) * room).join("");
        return {
          ...block,
          exactText: `${prefix}${part}`,
          indexText: `${prefix}${part}${suffix}`,
          content: { kind: "table_cells" as const, cells: [{ ...cell, value: part }] },
        };
      });
    });
  }
  const characters = Array.from(block.exactText);
  const parts: ProjectableBlock[] = [];
  let consumedCodeUnits = 0;
  for (let offset = 0; offset < characters.length; offset += maxUnits) {
    const text = characters.slice(offset, offset + maxUnits).join("");
    const start = block.locator.kind === "text_range" ? block.locator.start + consumedCodeUnits : 0;
    const end = start + text.length;
    const content =
      block.content?.kind === "visual_region"
        ? {
            kind: "visual_region" as const,
            accessibleDescription: text,
            ...(block.content.asset ? { asset: block.content.asset } : {}),
          }
        : block.content?.kind === "timed_transcript"
          ? { ...block.content, text }
          : { kind: "exact_text" as const, text };
    parts.push({
      ...block,
      exactText: text,
      indexText: text,
      locator:
        block.locator.kind === "text_range" ? { kind: "text_range", start, end } : block.locator,
      content,
    });
    consumedCodeUnits += text.length;
  }
  return parts;
}

function evidenceFromBlock(block: RepresentationBlock, ordinal: number): EvidenceUnit[] {
  const textLocator = block.locator.kind === "text_range" ? block.locator : null;
  const sentenceEligible =
    block.content.kind === "exact_text" &&
    block.exactText !== null &&
    textLocator !== null &&
    (block.kind === "paragraph" || block.kind === "quote");
  const parts = sentenceEligible
    ? sentenceRanges(block.exactText ?? "", textLocator.start).map((range) => ({
        text: range.text,
        locator: { kind: "text_range" as const, start: range.start, end: range.end },
        content: { kind: "exact_text" as const, text: range.text },
      }))
    : [{ text: block.exactText, locator: block.locator, content: block.content }];
  return parts.map((part, index) => ({
    id: knowledgeIdentity(
      block.representationId,
      "evidence",
      ordinal + index,
      blockIdentityLocator(part.locator),
      knowledgeStructuredContentHash({ content: part.content, locator: part.locator }),
    ),
    representationId: block.representationId,
    ordinal: ordinal + index,
    blockOrdinal: block.ordinal,
    exactExcerpt: part.text,
    locator: part.locator,
    content: part.content,
    fidelity: block.fidelity,
    contentHash: knowledgeStructuredContentHash({
      content: part.content,
      fidelity: block.fidelity,
      locator: part.locator,
    }),
    capacityUnits: part.text === null ? 0 : countCapacityUnits(part.text),
  }));
}

export function projectRepresentation(input: {
  representationId: string;
  blocks: ProjectableBlock[];
  profile?: KnowledgeProfile;
}): KnowledgeProjection {
  const profile = input.profile ?? knowledgeProfileV1;
  const blocks: RepresentationBlock[] = input.blocks
    .flatMap((block) => splitOversizedTextBlock(block, profile.chunk.maxUnits))
    .filter(
      (block) => block.exactText?.trim().length !== 0 || block.content?.kind === "visual_region",
    )
    .map((block, ordinal) => {
      if (block.exactText === null && block.content?.kind !== "visual_region") {
        throw new Error("knowledge_block_text_missing");
      }
      const content = block.content ?? { kind: "exact_text" as const, text: block.exactText ?? "" };
      const indexText = block.indexText === undefined ? block.exactText : block.indexText;
      const fidelity = block.fidelity ?? "source";
      return {
        id: knowledgeIdentity(
          input.representationId,
          "block",
          ordinal,
          blockIdentityLocator(block.locator),
        ),
        representationId: input.representationId,
        ordinal,
        kind: block.kind,
        headingPath: block.headingPath ?? [],
        exactText: block.exactText,
        indexText,
        locator: block.locator,
        content,
        fidelity,
        contentHash: knowledgeStructuredContentHash({ content, fidelity, locator: block.locator }),
        capacityUnits: indexText === null ? 0 : countCapacityUnits(indexText),
      };
    });

  const chunks: KnowledgeChunk[] = [];
  let pending: RepresentationBlock[] = [];
  const flush = () => {
    const first = pending[0];
    const last = pending.at(-1);
    if (!first || !last) return;
    const exactText = pending.map((block) => block.exactText).join("\n\n");
    const body = pending.map((block) => block.indexText).join("\n\n");
    const prefix = first.headingPath.length > 0 ? `${first.headingPath.join(" > ")}\n\n` : "";
    const ordinal = chunks.length;
    chunks.push({
      id: knowledgeIdentity(input.representationId, "chunk", ordinal, first.id, last.id),
      representationId: input.representationId,
      ordinal,
      firstBlockOrdinal: first.ordinal,
      lastBlockOrdinal: last.ordinal,
      headingPath: [...first.headingPath],
      exactText,
      indexText: `${prefix}${body}`,
      contentHash: knowledgeContentHash(exactText),
      capacityUnits: countCapacityUnits(body),
    });
    pending = [];
  };
  for (const block of blocks) {
    if (block.kind === "heading") {
      flush();
      continue;
    }
    if (block.indexText === null || block.exactText === null) continue;
    // A visual description is its own retrievable unit. Joining it to nearby prose makes the
    // visual evidence disappear from the candidate boundary and prevents faithful image handoff.
    if (block.kind === "visual") {
      flush();
      pending.push(block);
      flush();
      continue;
    }
    if (
      pending.length > 0 &&
      countCapacityUnits([...pending, block].map((item) => item.indexText).join("\n\n")) >
        profile.chunk.maxUnits
    ) {
      flush();
    }
    pending.push(block);
  }
  flush();

  const evidenceUnits: EvidenceUnit[] = [];
  for (const block of blocks) {
    if (
      block.kind === "heading" ||
      block.kind === "thematic_break" ||
      (block.indexText === null && block.content.kind !== "visual_region")
    ) {
      continue;
    }
    evidenceUnits.push(...evidenceFromBlock(block, evidenceUnits.length));
  }
  return { representationId: input.representationId, blocks, chunks, evidenceUnits };
}

function nodeKind(node: RootContent): RepresentationBlockKind | null {
  switch (node.type) {
    case "heading":
      return "heading";
    case "paragraph":
      return "paragraph";
    case "list":
      return "list";
    case "table":
      return "table";
    case "code":
    case "html":
      return "code";
    case "blockquote":
      return "quote";
    case "thematicBreak":
      return "thematic_break";
    default:
      return null;
  }
}

function plainText(node: RootContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) {
    return node.children
      .map((child) => plainText(child as RootContent))
      .join(" ")
      .trim();
  }
  return "";
}

export function markdownProjectableBlocks(text: string): ProjectableBlock[] {
  const root = unified().use(remarkParse).use(remarkGfm).parse(text) as Root;
  const headingPath: string[] = [];
  const blocks: ProjectableBlock[] = [];
  for (const node of root.children) {
    const kind = nodeKind(node);
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (!kind || start === undefined || end === undefined || end <= start) continue;
    const exactText = text.slice(start, end);
    if (!exactText.trim()) continue;
    if (node.type === "heading") {
      headingPath.splice(node.depth - 1);
      headingPath[node.depth - 1] = plainText(node);
    }
    blocks.push({
      kind,
      headingPath: [...headingPath],
      exactText,
      locator: { kind: "text_range", start, end },
    });
  }
  return blocks;
}

export function projectMarkdownRepresentation(input: {
  representationId: string;
  text: string;
  profile?: KnowledgeProfile;
}): KnowledgeProjection {
  return projectRepresentation({
    representationId: input.representationId,
    blocks: markdownProjectableBlocks(input.text),
    ...(input.profile ? { profile: input.profile } : {}),
  });
}
