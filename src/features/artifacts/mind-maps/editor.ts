import type { MindMapContent } from "./contract";

export type MindMapEditAction =
  | { type: "add_child"; parentId: string; id: string; label: string; note: string }
  | { type: "delete_subtree"; id: string }
  | { type: "move"; direction: -1 | 1; id: string }
  | { type: "replace"; content: MindMapContent }
  | { type: "update"; id: string; label: string; note: string };

export function mindMapEditReducer(
  content: MindMapContent,
  action: MindMapEditAction,
): MindMapContent {
  if (action.type === "replace") return action.content;
  if (action.type === "update") {
    return {
      ...content,
      nodes: content.nodes.map((node) =>
        node.id === action.id
          ? {
              ...node,
              label: action.label,
              ...(action.note.trim() ? { note: action.note } : { note: undefined }),
            }
          : node,
      ),
    };
  }
  if (action.type === "add_child") {
    const siblings = content.nodes.filter((node) => node.parentId === action.parentId);
    return {
      ...content,
      nodes: [
        ...content.nodes,
        {
          id: action.id,
          label: action.label,
          order: siblings.length,
          parentId: action.parentId,
          ...(action.note.trim() ? { note: action.note } : {}),
        },
      ],
    };
  }
  if (action.type === "delete_subtree") {
    if (action.id === content.rootId) return content;
    const removed = new Set([action.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of content.nodes) {
        if (node.parentId && removed.has(node.parentId) && !removed.has(node.id)) {
          removed.add(node.id);
          changed = true;
        }
      }
    }
    const parentId = content.nodes.find((node) => node.id === action.id)?.parentId;
    const remaining = content.nodes.filter((node) => !removed.has(node.id));
    return {
      ...content,
      nodes: remaining.map((node) =>
        node.parentId === parentId
          ? {
              ...node,
              order: remaining
                .filter((candidate) => candidate.parentId === parentId)
                .sort((a, b) => a.order - b.order)
                .findIndex((candidate) => candidate.id === node.id),
            }
          : node,
      ),
    };
  }
  const node = content.nodes.find((candidate) => candidate.id === action.id);
  if (!node?.parentId) return content;
  const siblings = content.nodes
    .filter((candidate) => candidate.parentId === node.parentId)
    .sort((a, b) => a.order - b.order);
  const index = siblings.findIndex((candidate) => candidate.id === node.id);
  const target = siblings[index + action.direction];
  if (!target) return content;
  return {
    ...content,
    nodes: content.nodes.map((candidate) => {
      if (candidate.id === node.id) return { ...candidate, order: target.order };
      if (candidate.id === target.id) return { ...candidate, order: node.order };
      return candidate;
    }),
  };
}
