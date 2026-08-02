import type { JSONContent } from "@tiptap/core";

export type TeachingDocumentMathSegment =
  | { from: number; kind: "text"; to: number }
  | { display: boolean; kind: "math"; latex: string };

export function teachingDocumentMathSegments(value: string): TeachingDocumentMathSegment[] {
  const output: TeachingDocumentMathSegment[] = [];
  const pattern = /\$\$\s*([\s\S]+?)\s*\$\$|\$(?!\d+\$)(.+?)\$(?!\d)/g;
  let offset = 0;

  for (const match of value.matchAll(pattern)) {
    const matchStart = match.index;
    if (matchStart > offset) output.push({ from: offset, kind: "text", to: matchStart });
    const latex = (match[1] ?? match[2])?.trim();
    if (latex) {
      output.push({ display: match[1] !== undefined, kind: "math", latex });
    } else {
      output.push({ from: matchStart, kind: "text", to: matchStart + match[0].length });
    }
    offset = matchStart + match[0].length;
  }

  if (offset < value.length) output.push({ from: offset, kind: "text", to: value.length });
  return output.length > 0 ? output : [{ from: 0, kind: "text", to: value.length }];
}

function nodeText(node: JSONContent): string {
  if (node.type === "hardBreak") return "\n";
  return node.text ?? node.content?.map(nodeText).join("") ?? "";
}

function blockMathNode(source: JSONContent, latex: string): JSONContent {
  return {
    attrs: {
      ...(source.attrs && typeof source.attrs.id === "string" ? { id: source.attrs.id } : {}),
      latex,
    },
    type: "blockMath",
  };
}

function sliceInlineContent(
  content: readonly JSONContent[],
  from: number,
  to: number,
): JSONContent[] {
  const result: JSONContent[] = [];
  let offset = 0;

  for (const node of content) {
    const text = node.type === "hardBreak" ? "\n" : (node.text ?? "");
    const nodeEnd = offset + text.length;
    const overlapFrom = Math.max(from, offset);
    const overlapTo = Math.min(to, nodeEnd);

    if (overlapFrom < overlapTo) {
      if (node.type === "hardBreak") result.push(node);
      else {
        result.push({
          ...node,
          text: text.slice(overlapFrom - offset, overlapTo - offset),
        });
      }
    }
    offset = nodeEnd;
  }

  return result;
}

function paragraphWithContent(source: JSONContent, content: JSONContent[]): JSONContent {
  return { ...source, content };
}

function splitInlineMath(node: JSONContent): JSONContent {
  if (node.type !== "paragraph" || !node.content) return node;
  const text = nodeText(node);
  const segments = teachingDocumentMathSegments(text);
  if (!segments.some((segment) => segment.kind === "math" && !segment.display)) return node;

  const content = segments.flatMap((segment): JSONContent[] => {
    if (segment.kind === "text")
      return sliceInlineContent(node.content ?? [], segment.from, segment.to);
    if (segment.display) {
      return [{ text: `$$${segment.latex}$$`, type: "text" }];
    }
    return [{ attrs: { latex: segment.latex }, type: "inlineMath" }];
  });
  return paragraphWithContent(node, content);
}

function splitEmbeddedBlockMath(node: JSONContent): JSONContent[] {
  const content = node.content ?? [];
  const text = nodeText(node);
  const matches = [...text.matchAll(/\$\$\s*([\s\S]+?)\s*\$\$/g)];
  if (matches.length === 0) return [node];

  const output: JSONContent[] = [];
  let offset = 0;
  let keepsSourceId = true;

  for (const match of matches) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    const prefix = sliceInlineContent(content, offset, matchStart);
    if (nodeText({ content: prefix }).length > 0) {
      output.push(
        paragraphWithContent(keepsSourceId ? node : { ...node, attrs: undefined }, prefix),
      );
      keepsSourceId = false;
    }

    const latex = match[1]?.trim();
    if (latex) {
      output.push(blockMathNode(keepsSourceId ? node : { ...node, attrs: undefined }, latex));
      keepsSourceId = false;
    }
    offset = matchEnd;
  }

  const suffix = sliceInlineContent(content, offset, text.length);
  if (nodeText({ content: suffix }).length > 0) {
    output.push(paragraphWithContent(keepsSourceId ? node : { ...node, attrs: undefined }, suffix));
  }
  return output;
}

function normalizeNodeChildren(node: JSONContent): JSONContent {
  if (!node.content || node.type === "paragraph") return node;
  return {
    ...node,
    content: normalizeTeachingDocumentMathNodes(node.content),
  };
}

export function normalizeTeachingDocumentMathNodes(nodes: readonly JSONContent[]): JSONContent[] {
  const recursivelyNormalized = nodes.map(normalizeNodeChildren);
  const normalized: JSONContent[] = [];

  for (let index = 0; index < recursivelyNormalized.length; index += 1) {
    const node = recursivelyNormalized[index];
    if (node?.type !== "paragraph") {
      if (node) normalized.push(node);
      continue;
    }

    const text = nodeText(node).trim();
    if (/^\$\$\s*[\s\S]+?\s*\$\$$/.test(text)) {
      normalized.push(...splitEmbeddedBlockMath(node));
      continue;
    }

    if (text !== "$$") {
      normalized.push(...splitEmbeddedBlockMath(node));
      continue;
    }

    const formulaLines: string[] = [];
    let closingIndex = index + 1;
    while (closingIndex < recursivelyNormalized.length) {
      const candidate = recursivelyNormalized[closingIndex];
      if (candidate?.type === "paragraph" && nodeText(candidate).trim() === "$$") break;
      if (candidate) formulaLines.push(nodeText(candidate));
      closingIndex += 1;
    }

    const latex = formulaLines.join("\n").trim();
    if (closingIndex < recursivelyNormalized.length && latex) {
      normalized.push(blockMathNode(node, latex));
      index = closingIndex;
      continue;
    }

    normalized.push(node);
  }

  return normalized.map(splitInlineMath);
}
