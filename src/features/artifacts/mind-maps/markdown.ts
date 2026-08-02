import type { MindMapContent } from "./contract";

const PAGE_SIZE = 40;

export function mindMapMarkdownPage(
  content: MindMapContent,
  cursor = 0,
  options: { includeNodeIds?: boolean } = {},
) {
  const children = new Map<string, typeof content.nodes>();
  for (const node of content.nodes) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.order - b.order);
  const ordered: Array<{ depth: number; id: string; label: string; note?: string | undefined }> =
    [];
  const visit = (id: string, depth: number) => {
    const node = content.nodes.find((candidate) => candidate.id === id);
    if (!node) return;
    ordered.push({
      depth,
      id: node.id,
      label: node.label,
      ...(node.note ? { note: node.note } : {}),
    });
    for (const child of children.get(id) ?? []) visit(child.id, depth + 1);
  };
  visit(content.rootId, 0);
  const start = Math.max(0, cursor);
  const page = ordered.slice(start, start + PAGE_SIZE);
  return {
    markdown: page
      .map(
        (node) =>
          `${"  ".repeat(node.depth)}- ${options.includeNodeIds ? `[node_id=${node.id}] ` : ""}${node.label}${node.note ? ` — ${node.note}` : ""}`,
      )
      .join("\n"),
    nextCursor: start + PAGE_SIZE < ordered.length ? start + PAGE_SIZE : null,
  };
}
