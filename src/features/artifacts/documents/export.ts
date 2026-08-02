import "server-only";

import type { JSONContent } from "@tiptap/core";
import { Docx, exportDocx } from "@tiptap-pro/extension-export-docx";
import type { TeachingDocumentRevisionContent } from "./contract";
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
    content: [
      {
        attrs: { level: 1 },
        content: [{ text: content.title, type: "text" }],
        type: "heading",
      },
      ...normalizedNodes,
    ],
    type: "doc",
  };
}

export async function teachingDocumentToDocx(content: TeachingDocumentRevisionContent) {
  const result = await exportDocx({
    comments: { threads: [] },
    customNodes: [],
    document: exportDocument(content),
    exportType: "buffer",
    styleOverrides: {},
    tableOverrides: {
      borders: {
        bottom: { color: "CBD5E1", size: 4, style: Docx.BorderStyle.SINGLE },
        insideHorizontal: { color: "CBD5E1", size: 4, style: Docx.BorderStyle.SINGLE },
        insideVertical: { color: "CBD5E1", size: 4, style: Docx.BorderStyle.SINGLE },
        left: { color: "CBD5E1", size: 4, style: Docx.BorderStyle.SINGLE },
        right: { color: "CBD5E1", size: 4, style: Docx.BorderStyle.SINGLE },
        top: { color: "CBD5E1", size: 4, style: Docx.BorderStyle.SINGLE },
      },
    },
  });
  if (!Buffer.isBuffer(result))
    throw new Error("Tiptap DOCX exporter returned a non-buffer result");
  return result;
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
