import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
  type ArtifactGenerationOutcome,
  type ArtifactProjection,
  hasVisibleArtifactOutput,
} from "@/features/artifacts/generation";
import type {
  TeachingDocumentInlineNodeV2,
  TeachingDocumentListItemV2,
  TeachingDocumentRevisionContentV2,
} from "./revision-v2";
import { teachingDocumentRevisionContentV2Schema } from "./revision-v2";
import { normalizeImplicitMarkdownTables } from "./tables";

type Inline = TeachingDocumentInlineNodeV2;
type DocumentBlock = TeachingDocumentRevisionContentV2["document"]["content"][number];
type TextInline = Extract<Inline, { type: "text" }>;
type TextMark = NonNullable<TextInline["marks"]>[number];

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function children(value: unknown) {
  const candidate = record(value)?.children;
  return Array.isArray(candidate) ? candidate : [];
}

function plainText(value: unknown): string {
  const node = record(value);
  if (!node) return typeof value === "string" ? value : "";
  if (typeof node.value === "string") return node.value;
  if (typeof node.alt === "string") return node.alt;
  return children(node).map(plainText).join("");
}

function nodeId(path: string) {
  return `node-${path.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`.slice(0, 128);
}

function marksEqual(left: TextMark[] | undefined, right: TextMark[] | undefined) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function appendText(target: Inline[], text: string, marks: TextMark[] = []) {
  if (!text) return;
  const previous = target.at(-1);
  if (previous?.type === "text" && marksEqual(previous.marks, marks)) {
    previous.text += text;
    return;
  }
  target.push({ ...(marks.length > 0 ? { marks } : {}), text, type: "text" });
}

function safeHref(value: unknown) {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (/^(?:https?:|mailto:|#)/i.test(href)) return href.slice(0, 8_192);
  return null;
}

function inlineContent(value: unknown, inheritedMarks: TextMark[] = []): Inline[] {
  const node = record(value);
  if (!node) return [];
  const type = typeof node.type === "string" ? node.type : "";
  const output: Inline[] = [];
  if (type === "text") {
    appendText(output, typeof node.value === "string" ? node.value : "", inheritedMarks);
    return output;
  }
  if (type === "break") return [{ type: "hardBreak" }];
  if (type === "inlineCode") {
    appendText(output, typeof node.value === "string" ? node.value : "", [
      ...inheritedMarks,
      { type: "code" },
    ]);
    return output;
  }
  if (type === "image") {
    const alt = typeof node.alt === "string" && node.alt.trim() ? node.alt : "image";
    const href = safeHref(node.url);
    appendText(output, href ? `${alt} (${href})` : alt, inheritedMarks);
    return output;
  }
  if (type === "html") {
    const html = typeof node.value === "string" ? node.value : "";
    if (/^<br\s*\/?\s*>$/i.test(html.trim())) return [{ type: "hardBreak" }];
    appendText(output, html, inheritedMarks);
    return output;
  }

  let marks = inheritedMarks;
  if (type === "strong") marks = [...marks, { type: "bold" }];
  if (type === "emphasis") marks = [...marks, { type: "italic" }];
  if (type === "delete") marks = [...marks, { type: "strike" }];
  if (type === "link") {
    const href = safeHref(node.url);
    if (href) marks = [...marks, { attrs: { href }, type: "link" }];
  }
  for (const child of children(node)) {
    for (const inline of inlineContent(child, marks)) {
      if (inline.type === "hardBreak") output.push(inline);
      else appendText(output, inline.text, inline.marks);
    }
  }
  if (output.length === 0 && typeof node.value === "string") {
    appendText(output, node.value, marks);
  }
  return output;
}

function paragraph(value: unknown, path: string) {
  const content = inlineContent(value);
  return {
    attrs: { id: nodeId(path) },
    ...(content.length > 0 ? { content } : {}),
    type: "paragraph" as const,
  };
}

function listBlock(
  value: unknown,
  path: string,
): Extract<DocumentBlock, { type: "bulletList" | "orderedList" }> {
  const node = record(value);
  const ordered = node?.ordered === true;
  const items = children(node).map((item, itemIndex) => {
    const itemChildren = children(item);
    const content: TeachingDocumentListItemV2["content"] = [];
    for (const [childIndex, child] of itemChildren.entries()) {
      const childType = record(child)?.type;
      if (childType === "list") {
        content.push(listBlock(child, `${path}-${itemIndex}-${childIndex}-list`));
      } else {
        content.push(paragraph(child, `${path}-${itemIndex}-${childIndex}-paragraph`));
      }
    }
    if (content.length === 0) {
      content.push(paragraph({ value: plainText(item) }, `${path}-${itemIndex}-fallback`));
    }
    return {
      attrs: { id: nodeId(`${path}-${itemIndex}-item`) },
      content,
      type: "listItem" as const,
    };
  });
  if (ordered) {
    return {
      attrs: {
        id: nodeId(path),
        start: typeof node?.start === "number" && node.start >= 1 ? Math.trunc(node.start) : 1,
        type: null,
      },
      content:
        items.length > 0
          ? items
          : [
              {
                attrs: { id: nodeId(`${path}-fallback-item`) },
                content: [
                  paragraph({ value: plainText(value) || " " }, `${path}-fallback-paragraph`),
                ],
                type: "listItem",
              },
            ],
      type: "orderedList",
    };
  }
  return {
    attrs: { id: nodeId(path) },
    content:
      items.length > 0
        ? items
        : [
            {
              attrs: { id: nodeId(`${path}-fallback-item`) },
              content: [
                paragraph({ value: plainText(value) || " " }, `${path}-fallback-paragraph`),
              ],
              type: "listItem",
            },
          ],
    type: "bulletList",
  };
}

function tableBlock(value: unknown, path: string): Extract<DocumentBlock, { type: "table" }> {
  const rows = children(value).map((row, rowIndex) => ({
    attrs: { id: nodeId(`${path}-row-${rowIndex}`) },
    content: children(row).map((cell, cellIndex) => ({
      attrs: { id: nodeId(`${path}-row-${rowIndex}-cell-${cellIndex}`) },
      content: [paragraph(cell, `${path}-row-${rowIndex}-cell-${cellIndex}-paragraph`)],
      type: rowIndex === 0 ? ("tableHeader" as const) : ("tableCell" as const),
    })),
    type: "tableRow" as const,
  }));
  return {
    attrs: { id: nodeId(path) },
    content:
      rows.length > 0
        ? rows
        : [
            {
              attrs: { id: nodeId(`${path}-fallback-row`) },
              content: [
                {
                  attrs: { id: nodeId(`${path}-fallback-cell`) },
                  content: [paragraph({ value: plainText(value) }, `${path}-fallback-paragraph`)],
                  type: "tableHeader",
                },
              ],
              type: "tableRow",
            },
          ],
    type: "table",
  };
}

function projectBlocks(root: unknown) {
  const blocks: DocumentBlock[] = [];
  let firstHeading: string | null = null;
  for (const [index, candidate] of children(root).entries()) {
    const node = record(candidate);
    if (!node) continue;
    const path = `${index}`;
    if (node.type === "heading") {
      const text = plainText(node).trim();
      if (!firstHeading && text) firstHeading = text;
      const content = inlineContent(node);
      blocks.push({
        attrs: {
          id: nodeId(`${path}-heading`),
          level: Math.min(3, Math.max(1, Number(node.depth) || 1)),
        },
        ...(content.length > 0 ? { content } : {}),
        type: "heading",
      });
      continue;
    }
    if (node.type === "paragraph") {
      blocks.push(paragraph(node, `${path}-paragraph`));
      continue;
    }
    if (node.type === "list") {
      blocks.push(listBlock(node, `${path}-list`));
      continue;
    }
    if (node.type === "blockquote") {
      const paragraphs = children(node).map((child, childIndex) =>
        paragraph(child, `${path}-${childIndex}-quote`),
      );
      blocks.push({
        attrs: { id: nodeId(`${path}-blockquote`) },
        content: paragraphs.length > 0 ? paragraphs : [paragraph(node, `${path}-quote-fallback`)],
        type: "blockquote",
      });
      continue;
    }
    if (node.type === "code") {
      const text = typeof node.value === "string" ? node.value : plainText(node);
      blocks.push({
        attrs: {
          id: nodeId(`${path}-code`),
          language: typeof node.lang === "string" && node.lang.trim() ? node.lang.trim() : null,
        },
        ...(text ? { content: [{ text, type: "text" }] } : {}),
        type: "codeBlock",
      });
      continue;
    }
    if (node.type === "table") {
      blocks.push(tableBlock(node, `${path}-table`));
      continue;
    }
    if (node.type === "thematicBreak") {
      blocks.push({ attrs: { id: nodeId(`${path}-horizontal-rule`) }, type: "horizontalRule" });
      continue;
    }
    const text = plainText(node);
    if (text) blocks.push(paragraph({ value: text }, `${path}-fallback`));
  }
  return { blocks, firstHeading };
}

function fallbackTitle(rawOutput: string, requestedTitle: string) {
  const firstLine = rawOutput
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s*/, "").trim())
    .find(Boolean);
  return (firstLine || requestedTitle || "Untitled document").normalize("NFKC").slice(0, 200);
}

export function projectTeachingDocument(input: {
  outcome: ArtifactGenerationOutcome;
  rawOutput: string;
  requestedTitle: string;
}): ArtifactProjection<TeachingDocumentRevisionContentV2> {
  if (!hasVisibleArtifactOutput(input.rawOutput)) {
    throw new Error("teaching_document_invalid_output");
  }
  let projected: ReturnType<typeof projectBlocks>;
  try {
    const tree = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .parse(normalizeImplicitMarkdownTables(input.rawOutput));
    projected = projectBlocks(tree);
  } catch (error) {
    throw new Error("teaching_document_invalid_output", { cause: error });
  }
  if (projected.blocks.length === 0) throw new Error("teaching_document_invalid_output");
  const warnings = input.outcome === "partial" ? (["partial_generation"] as const) : [];
  const title = (
    projected.firstHeading || fallbackTitle(input.rawOutput, input.requestedTitle)
  ).slice(0, 200);
  const generation = {
    outcome: input.outcome,
    rawOutput: input.rawOutput,
    warnings: [...warnings],
  };
  const revision = teachingDocumentRevisionContentV2Schema.parse({
    document: { content: projected.blocks, type: "doc" },
    generation,
    schemaVersion: 2,
    sourceMarkdown: input.rawOutput,
    title,
  });
  return { ...generation, revision };
}
