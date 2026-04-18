"use client";

import type { JSONContent } from "@tiptap/react";

export interface DocumentBlockItem {
  id: string;
  type: "heading" | "paragraph" | "bulletList" | "orderedList";
  text: string;
}

type ProseMirrorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
};

function paragraphNode(text: string): ProseMirrorNode {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function buildListNode(lines: string[], ordered = false): ProseMirrorNode {
  return {
    type: ordered ? "orderedList" : "bulletList",
    content: lines.map((line) => ({
      type: "listItem",
      content: [paragraphNode(line.trim())],
    })),
  };
}

export function markdownToDoc(markdown: string): JSONContent {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const content: ProseMirrorNode[] = blocks.map((block) => {
    const listLines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (listLines.length > 1 && listLines.every((line) => /^[-*]\s+/.test(line))) {
      return buildListNode(
        listLines.map((line) => line.replace(/^[-*]\s+/, "").trim()),
        false
      );
    }
    if (listLines.length > 1 && listLines.every((line) => /^\d+\.\s+/.test(line))) {
      return buildListNode(
        listLines.map((line) => line.replace(/^\d+\.\s+/, "").trim()),
        true
      );
    }

    const headingMatch = block.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      return {
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: [{ type: "text", text: headingMatch[2].trim() }],
      };
    }

    return paragraphNode(block.replace(/\n+/g, " ").trim());
  });

  return {
    type: "doc",
    content: content.length > 0 ? content : [paragraphNode("暂无可展示正文。")],
  };
}

function extractText(node?: JSONContent | null): string {
  if (!node) return "";
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  return (node.content ?? []).map((child) => extractText(child)).join("").trim();
}

export function extractDocumentBlocks(document?: JSONContent | null): DocumentBlockItem[] {
  const content = Array.isArray(document?.content) ? document?.content : [];
  return content
    .map((node, index) => {
      if (!node?.type) return null;
      if (!["heading", "paragraph", "bulletList", "orderedList"].includes(node.type)) {
        return null;
      }
      return {
        id: `block-${index + 1}`,
        type: node.type as DocumentBlockItem["type"],
        text: extractText(node),
      };
    })
    .filter((item): item is DocumentBlockItem => Boolean(item));
}
