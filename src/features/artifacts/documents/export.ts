import "server-only";

import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import { execa } from "execa";
import type { TeachingDocumentRevisionContent } from "./contract";
import { teachingDocumentEditorJsonToMarkdown } from "./markdown";
import { normalizeTeachingDocumentMathNodes } from "./math";

function nodeText(node: JSONContent): string {
  return node.text ?? node.content?.map(nodeText).join("") ?? "";
}

function jsonContent(value: unknown): JSONContent {
  if (!value || typeof value !== "object") return {};
  const type = Reflect.get(value, "type");
  const text = Reflect.get(value, "text");
  const attrs = Reflect.get(value, "attrs");
  const marks = Reflect.get(value, "marks");
  const content = Reflect.get(value, "content");
  return {
    ...(typeof type === "string" ? { type } : {}),
    ...(typeof text === "string" ? { text } : {}),
    ...(attrs && typeof attrs === "object" ? { attrs } : {}),
    ...(Array.isArray(marks) ? { marks } : {}),
    ...(Array.isArray(content) ? { content: content.map(jsonContent) } : {}),
  };
}

function normalizedLabel(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isRepeatedTitle(node: JSONContent | undefined, title: string) {
  if (node?.type !== "heading") return false;
  const nodeTitle = normalizedLabel(nodeText(node));
  const expectedTitle = normalizedLabel(title);
  return (
    nodeTitle === expectedTitle ||
    (expectedTitle.length === 200 && nodeTitle.startsWith(expectedTitle))
  );
}

function nestedBlockMathAsParagraph(node: JSONContent, parentType = "doc"): JSONContent {
  if (node.type === "blockMath" && parentType !== "doc") {
    return {
      content: [{ attrs: { latex: node.attrs?.latex }, type: "inlineMath" }],
      type: "paragraph",
    };
  }
  return {
    ...node,
    ...(node.content
      ? { content: node.content.map((child) => nestedBlockMathAsParagraph(child, node.type)) }
      : {}),
  };
}

function exportDocument(content: TeachingDocumentRevisionContent): JSONContent {
  const normalizedNodes = normalizeTeachingDocumentMathNodes(
    content.document.content.map(jsonContent),
  ).map((node) => nestedBlockMathAsParagraph(node));
  if (isRepeatedTitle(normalizedNodes[0], content.title)) normalizedNodes.shift();

  return {
    content: normalizedNodes,
    type: "doc",
  };
}

export async function teachingDocumentToDocx(content: TeachingDocumentRevisionContent) {
  const markdown = teachingDocumentEditorJsonToMarkdown(exportDocument(content), content.title);
  try {
    const { stdout } = await execa(
      "pandoc",
      [
        "--sandbox",
        "--from=commonmark_x+tex_math_dollars-raw_html",
        "--to=docx",
        "--output=-",
        "--fail-if-warnings",
        `--reference-doc=${path.join(process.cwd(), "src/features/artifacts/documents/pandoc-reference.docx")}`,
      ],
      { encoding: "buffer", input: markdown, maxBuffer: 16 * 1024 * 1024, timeout: 30_000 },
    );
    return Buffer.from(stdout);
  } catch (error) {
    // Converter diagnostics can contain document text; never propagate them into runtime logs.
    const unavailable = error instanceof Error && "code" in error && error.code === "ENOENT";
    throw new Error(unavailable ? "pandoc_unavailable" : "teaching_document_export_failed");
  }
}

export function docxFilename(title: string) {
  const safe = [...title]
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 120);
  return `${safe || "teaching-document"}.docx`;
}
