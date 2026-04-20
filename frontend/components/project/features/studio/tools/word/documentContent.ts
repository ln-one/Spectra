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
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const content: ProseMirrorNode[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const text = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    if (text) content.push(paragraphNode(text));
    paragraphLines = [];
  };

  const parseListItem = (line: string) => {
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) return { ordered: false, text: unordered[1].trim() };
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) return { ordered: true, text: ordered[1].trim() };
    return null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      content.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: [{ type: "text", text: headingMatch[2].trim() }],
      });
      continue;
    }

    const listItem = parseListItem(rawLine);
    if (listItem) {
      flushParagraph();
      const listLines: string[] = [listItem.text];
      const ordered = listItem.ordered;
      while (i + 1 < lines.length) {
        const next = parseListItem(lines[i + 1] ?? "");
        if (!next || next.ordered !== ordered) break;
        listLines.push(next.text);
        i += 1;
      }
      content.push(buildListNode(listLines, ordered));
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();

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

function extractNodeText(node?: JSONContent | null): string {
  if (!node) return "";
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  return (node.content ?? []).map((child) => extractNodeText(child)).join("").trim();
}

export function documentToMarkdown(document?: JSONContent | null): string {
  const nodes = Array.isArray(document?.content) ? document.content : [];
  const blocks: string[] = [];

  nodes.forEach((node) => {
    if (!node?.type) return;
    if (node.type === "heading") {
      const level =
        typeof node.attrs?.level === "number"
          ? Math.min(3, Math.max(1, node.attrs.level))
          : 1;
      const text = extractNodeText(node);
      if (text) blocks.push(`${"#".repeat(level)} ${text}`);
      return;
    }

    if (node.type === "paragraph") {
      const text = extractNodeText(node);
      if (text) blocks.push(text);
      return;
    }

    if (node.type === "bulletList" || node.type === "orderedList") {
      const items = Array.isArray(node.content) ? node.content : [];
      const listLines = items
        .map((item, index) => {
          const text = extractNodeText(item);
          if (!text) return "";
          if (node.type === "orderedList") return `${index + 1}. ${text}`;
          return `- ${text}`;
        })
        .filter(Boolean);
      if (listLines.length > 0) blocks.push(listLines.join("\n"));
    }
  });

  return blocks.join("\n\n").trim();
}
