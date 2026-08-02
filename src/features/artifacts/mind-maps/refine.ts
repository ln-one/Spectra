import { z } from "zod";
import {
  type MindMapContent,
  type MindMapRevisionContent,
  mindMapRevisionContentSchema,
} from "./contract";
import { mindMapEditReducer } from "./editor";

const nodeIdSchema = z.string().trim().min(1).max(128);

export type MindMapRefineTreeNode = {
  key: string;
  label: string;
  note?: string | undefined;
  parentKey: string | null;
};

const mindMapRefineTreeNodeSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(120),
    note: z.string().trim().max(20_000).default(""),
    parentKey: z.string().trim().min(1).max(64).nullable(),
  })
  .strict();

export const mindMapFocusSchema = z
  .object({
    kind: z.literal("mind_map_subtrees"),
    nodeIds: z.array(nodeIdSchema).min(1).max(20),
    revisionId: z.string().uuid(),
  })
  .strict()
  .superRefine((focus, context) => {
    if (new Set(focus.nodeIds).size !== focus.nodeIds.length) {
      context.addIssue({ code: "custom", message: "Focused node IDs must be unique" });
    }
  });

export type MindMapFocus = z.infer<typeof mindMapFocusSchema>;

export const resolvedMindMapFocusSchema = mindMapFocusSchema
  .safeExtend({
    allowedNodeIds: z.array(nodeIdSchema).min(1).max(5_000),
    contextMarkdown: z.string().trim().min(1).max(100_000),
  })
  .strict();

export type ResolvedMindMapFocus = z.infer<typeof resolvedMindMapFocusSchema>;

const mindMapAddChildEditSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    note: z.string().trim().max(20_000).default(""),
    parentId: nodeIdSchema,
    type: z.literal("add_child"),
  })
  .strict();

const mindMapAddTreeEditSchema = z
  .object({
    levels: z.number().int().min(1).max(50),
    nodes: z.array(mindMapRefineTreeNodeSchema).min(1).max(50),
    parentId: nodeIdSchema,
    type: z.literal("add_tree"),
  })
  .strict();

const mindMapDeleteEditSchema = z
  .object({ id: nodeIdSchema, type: z.literal("delete_subtree") })
  .strict();

const mindMapMoveEditSchema = z
  .object({ direction: z.enum(["up", "down"]), id: nodeIdSchema, type: z.literal("move") })
  .strict();

const mindMapUpdateEditSchema = z
  .object({
    id: nodeIdSchema,
    label: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(20_000).optional(),
    type: z.literal("update"),
  })
  .strict()
  .refine((edit) => edit.label !== undefined || edit.note !== undefined, {
    message: "Provide a label or note",
  });

const mindMapRefineEditSchema = z.discriminatedUnion("type", [
  mindMapAddChildEditSchema,
  mindMapAddTreeEditSchema,
  mindMapDeleteEditSchema,
  mindMapMoveEditSchema,
  mindMapUpdateEditSchema,
]);

const mindMapProposalRefineEditSchema = z.discriminatedUnion("type", [
  mindMapAddTreeEditSchema,
  mindMapDeleteEditSchema,
  mindMapMoveEditSchema,
  mindMapUpdateEditSchema,
]);

export type MindMapRefineEdit = z.infer<typeof mindMapRefineEditSchema>;

export function countMindMapRefineChanges(edits: readonly MindMapRefineEdit[]) {
  return edits.reduce(
    (total, edit) => total + (edit.type === "add_tree" ? edit.nodes.length : 1),
    0,
  );
}

function reviewMindMapRefineEditStructure(
  edits: readonly MindMapRefineEdit[],
  context: z.RefinementCtx,
) {
  if (countMindMapRefineChanges(edits) > 50) {
    context.addIssue({
      code: "custom",
      message: "Mind map proposals may contain at most 50 changes",
    });
  }
  for (const [editIndex, edit] of edits.entries()) {
    if (edit.type !== "add_tree") continue;
    const nodeIndexByKey = new Map<string, number>();
    for (const [nodeIndex, node] of edit.nodes.entries()) {
      if (nodeIndexByKey.has(node.key)) {
        context.addIssue({
          code: "custom",
          message: "Tree node keys must be unique",
          path: [editIndex, "nodes", nodeIndex, "key"],
        });
      } else {
        nodeIndexByKey.set(node.key, nodeIndex);
      }
    }
    const parentByKey = new Map(edit.nodes.map((node) => [node.key, node.parentKey]));
    const parentKeys = new Set(
      edit.nodes.flatMap((node) => (node.parentKey === null ? [] : [node.parentKey])),
    );
    for (const [nodeIndex, node] of edit.nodes.entries()) {
      if (node.parentKey !== null && !nodeIndexByKey.has(node.parentKey)) {
        context.addIssue({
          code: "custom",
          message: "Tree parentKey must reference a node in the same edit",
          path: [editIndex, "nodes", nodeIndex, "parentKey"],
        });
        continue;
      }
      const visited = new Set<string>();
      let currentKey: string | null = node.key;
      let depth = 0;
      while (currentKey !== null) {
        if (visited.has(currentKey)) {
          context.addIssue({
            code: "custom",
            message: "Tree nodes must not form a cycle",
            path: [editIndex, "nodes", nodeIndex, "parentKey"],
          });
          break;
        }
        visited.add(currentKey);
        depth += 1;
        currentKey = parentByKey.get(currentKey) ?? null;
      }
      if (!parentKeys.has(node.key) && depth !== edit.levels) {
        context.addIssue({
          code: "custom",
          message: "Every tree branch must include the declared number of levels",
          path: [editIndex, "nodes", nodeIndex],
        });
      }
    }
  }
}

export const mindMapRefineEditsSchema = z
  .array(mindMapRefineEditSchema)
  .min(1)
  .max(50)
  .superRefine(reviewMindMapRefineEditStructure);

export const mindMapProposalRefineEditsSchema = z
  .array(mindMapProposalRefineEditSchema)
  .min(1)
  .max(50)
  .superRefine(reviewMindMapRefineEditStructure);

export type MindMapProposalNodeChange = {
  id: string;
  previousLabel?: string;
  state: "added" | "deleted" | "moved" | "scope" | "unchanged" | "updated";
};

export type MindMapProposalDiff = {
  changes: Map<string, MindMapProposalNodeChange>;
  deletedNodeIds: Set<string>;
};

export function classifyMindMapProposal(
  before: MindMapContent,
  after: MindMapContent,
): MindMapProposalDiff {
  const beforeById = new Map(before.nodes.map((node) => [node.id, node]));
  const afterById = new Map(after.nodes.map((node) => [node.id, node]));
  const changes = new Map<string, MindMapProposalNodeChange>();
  const deletedNodeIds = new Set<string>();
  const addedParentIds = new Set<string>();

  for (const node of after.nodes) {
    const previous = beforeById.get(node.id);
    if (!previous) {
      changes.set(node.id, { id: node.id, state: "added" });
      if (node.parentId) addedParentIds.add(node.parentId);
      continue;
    }
    const moved = previous.parentId !== node.parentId || previous.order !== node.order;
    const updated = previous.label !== node.label || (previous.note ?? "") !== (node.note ?? "");
    changes.set(node.id, {
      id: node.id,
      ...(previous.label !== node.label ? { previousLabel: previous.label } : {}),
      state: moved ? "moved" : updated ? "updated" : "unchanged",
    });
  }

  for (const parentId of addedParentIds) {
    if (changes.get(parentId)?.state === "unchanged") {
      changes.set(parentId, { id: parentId, state: "scope" });
    }
  }

  for (const node of before.nodes) {
    if (afterById.has(node.id)) continue;
    deletedNodeIds.add(node.id);
    changes.set(node.id, { id: node.id, state: "deleted" });
  }

  return { changes, deletedNodeIds };
}

function descendants(content: MindMapContent, roots: readonly string[]) {
  const allowed = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of content.nodes) {
      if (node.parentId && allowed.has(node.parentId) && !allowed.has(node.id)) {
        allowed.add(node.id);
        changed = true;
      }
    }
  }
  return allowed;
}

function ancestorBreadcrumb(content: MindMapContent, id: string) {
  const byId = new Map(content.nodes.map((node) => [node.id, node]));
  const labels: string[] = [];
  let current = byId.get(id);
  while (current) {
    labels.unshift(current.label);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return labels.join(" > ");
}

export function validateMindMapFocus(content: MindMapContent, focus: MindMapFocus) {
  const parsed = mindMapFocusSchema.parse(focus);
  const byId = new Map(content.nodes.map((node) => [node.id, node]));
  if (parsed.nodeIds.some((id) => !byId.has(id))) return null;
  const allowed = descendants(content, parsed.nodeIds);
  const nodes = content.nodes
    .filter((node) => allowed.has(node.id))
    .sort((a, b) => a.order - b.order);
  const contextMarkdown = parsed.nodeIds
    .map((rootId) => {
      const lines = nodes
        .filter((node) => {
          let current = node;
          while (current.parentId) {
            if (current.parentId === rootId) return true;
            const parent = byId.get(current.parentId);
            if (!parent) return false;
            current = parent;
          }
          return node.id === rootId;
        })
        .map((node) => `- [node:${node.id}] ${node.label}${node.note ? ` — ${node.note}` : ""}`);
      return `Breadcrumb: ${ancestorBreadcrumb(content, rootId)}\n${lines.join("\n")}`;
    })
    .join("\n\n");
  return resolvedMindMapFocusSchema.parse({
    ...parsed,
    allowedNodeIds: [...allowed],
    contextMarkdown,
  });
}

export type MindMapProposalScopeReview =
  | { status: "allowed" }
  | { allowedNodeIds: string[]; status: "outside_scope" };

export function reviewMindMapProposalScope(
  content: MindMapContent,
  focus: ResolvedMindMapFocus | null | undefined,
  edits: readonly MindMapRefineEdit[],
): MindMapProposalScopeReview {
  if (!focus) return { status: "allowed" };
  const allowed = new Set(focus.allowedNodeIds);
  const byId = new Map(content.nodes.map((node) => [node.id, node]));
  const orderedSiblings = (id: string) => {
    const node = byId.get(id);
    if (!node?.parentId) return [];
    return content.nodes
      .filter((candidate) => candidate.parentId === node.parentId)
      .sort((a, b) => a.order - b.order);
  };
  const isAllowed = edits.every((edit) => {
    if (edit.type === "add_child" || edit.type === "add_tree") {
      return allowed.has(edit.parentId);
    }
    if (!allowed.has(edit.id)) return false;
    if (edit.type !== "move") return true;
    const siblings = orderedSiblings(edit.id);
    const index = siblings.findIndex((node) => node.id === edit.id);
    const target = siblings[index + (edit.direction === "up" ? -1 : 1)];
    return !target || allowed.has(target.id);
  });
  return isAllowed
    ? { status: "allowed" }
    : { allowedNodeIds: [...focus.allowedNodeIds], status: "outside_scope" };
}

export function applyMindMapRefineEdits(
  input: MindMapRevisionContent,
  edits: readonly MindMapRefineEdit[],
  idFactory: () => string = () => globalThis.crypto.randomUUID(),
) {
  let content: MindMapContent = structuredClone(input);
  const addNode = (parentId: string, label: string, note: string) => {
    const id = idFactory();
    content = mindMapEditReducer(content, {
      id,
      label,
      note,
      parentId,
      type: "add_child",
    });
    return id;
  };
  for (const edit of edits) {
    if (edit.type === "add_child") {
      addNode(edit.parentId, edit.label, edit.note);
      continue;
    }
    if (edit.type === "add_tree") {
      const nodesByParentKey = new Map<string | null, MindMapRefineTreeNode[]>();
      for (const node of edit.nodes) {
        const siblings = nodesByParentKey.get(node.parentKey) ?? [];
        siblings.push(node);
        nodesByParentKey.set(node.parentKey, siblings);
      }
      const addTreeLevel = (parentId: string, parentKey: string | null) => {
        for (const node of nodesByParentKey.get(parentKey) ?? []) {
          const id = addNode(parentId, node.label, node.note ?? "");
          addTreeLevel(id, node.key);
        }
      };
      addTreeLevel(edit.parentId, null);
      continue;
    }
    if (edit.type === "delete_subtree") {
      if (!content.nodes.some((node) => node.id === edit.id))
        throw new Error("mind_map_node_not_found");
      content = mindMapEditReducer(content, edit);
      continue;
    }
    if (edit.type === "move") {
      if (!content.nodes.some((node) => node.id === edit.id))
        throw new Error("mind_map_node_not_found");
      content = mindMapEditReducer(content, {
        direction: edit.direction === "up" ? -1 : 1,
        id: edit.id,
        type: "move",
      });
      continue;
    }
    const node = content.nodes.find((candidate) => candidate.id === edit.id);
    if (!node) throw new Error("mind_map_node_not_found");
    content = mindMapEditReducer(content, {
      id: edit.id,
      label: edit.label ?? node.label,
      note: edit.note ?? node.note ?? "",
      type: "update",
    });
  }
  return mindMapRevisionContentSchema.parse({
    ...content,
    generation: input.generation,
    schemaVersion: 2,
  });
}
