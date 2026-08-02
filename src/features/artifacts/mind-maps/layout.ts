import type dagreModule from "@dagrejs/dagre";
import type { MindMapContent } from "./contract";

// Dagre determines horizontal ranks. Vertical placement is owned here so branch
// subtrees stay compact instead of being forced into table-like rows.
const dagre: typeof dagreModule = require("@dagrejs/dagre");

const MIND_MAP_ROOT_WIDTH = 224;
const MIND_MAP_ROOT_HEIGHT = 72;
const MIND_MAP_BRANCH_WIDTH = 200;
const MIND_MAP_BRANCH_HEIGHT = 60;
const MIND_MAP_NODE_WIDTH = 176;
const MIND_MAP_NODE_HEIGHT = 52;
const MIND_MAP_INITIAL_VISIBLE_BUDGET = 24;

const HORIZONTAL_GAP = 96;
const SIBLING_GAP = 32;
const BRANCH_GAP = 48;

export type MindMapSide = "center" | "left" | "right";

export type PositionedMindMapNode = {
  branchIndex: number;
  depth: number;
  height: number;
  id: string;
  position: { x: number; y: number };
  side: MindMapSide;
  width: number;
};

type MindMapTree = {
  children: Map<string, string[]>;
  nodeById: Map<string, MindMapContent["nodes"][number]>;
  parentById: Map<string, string>;
};

function treeIndex(content: MindMapContent): MindMapTree {
  const children = new Map<string, string[]>();
  const nodeById = new Map(content.nodes.map((node) => [node.id, node]));
  const order = new Map(content.nodes.map((node) => [node.id, node.order]));
  const parentById = new Map<string, string>();
  for (const node of content.nodes) {
    if (!node.parentId) continue;
    parentById.set(node.id, node.parentId);
    const items = children.get(node.parentId) ?? [];
    items.push(node.id);
    children.set(node.parentId, items);
  }
  for (const items of children.values()) {
    items.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  }
  return { children, nodeById, parentById };
}

function resolveRootId(content: MindMapContent, focusRootId?: string | null) {
  return focusRootId && content.nodes.some((node) => node.id === focusRootId)
    ? focusRootId
    : content.rootId;
}

function dimensions(depth: number) {
  if (depth === 0) return { height: MIND_MAP_ROOT_HEIGHT, width: MIND_MAP_ROOT_WIDTH };
  if (depth === 1) return { height: MIND_MAP_BRANCH_HEIGHT, width: MIND_MAP_BRANCH_WIDTH };
  return { height: MIND_MAP_NODE_HEIGHT, width: MIND_MAP_NODE_WIDTH };
}

export function getMindMapVisibleNodeIds(input: {
  collapsedIds?: ReadonlySet<string>;
  content: MindMapContent;
  focusRootId?: string | null;
}) {
  const collapsed = input.collapsedIds ?? new Set<string>();
  const { children } = treeIndex(input.content);
  const rootId = resolveRootId(input.content, input.focusRootId);
  const visible: string[] = [];
  const visit = (id: string) => {
    visible.push(id);
    if (id !== rootId && collapsed.has(id)) return;
    for (const childId of children.get(id) ?? []) visit(childId);
  };
  visit(rootId);
  return visible;
}

export function getMindMapDescendantCounts(content: MindMapContent) {
  const { children } = treeIndex(content);
  const counts = new Map<string, number>();
  const count = (id: string): number => {
    const total = (children.get(id) ?? []).reduce((sum, childId) => sum + 1 + count(childId), 0);
    counts.set(id, total);
    return total;
  };
  count(content.rootId);
  return counts;
}

export function countMindMapDescendants(content: MindMapContent, nodeId: string) {
  return getMindMapDescendantCounts(content).get(nodeId) ?? 0;
}

export function getMindMapPath(content: MindMapContent, nodeId: string) {
  const { nodeById, parentById } = treeIndex(content);
  const path: MindMapContent["nodes"] = [];
  let currentId: string | undefined = nodeId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = nodeById.get(currentId);
    if (!node) break;
    path.unshift(node);
    currentId = parentById.get(currentId);
  }
  return path;
}

export function createInitialMindMapCollapsedIds(input: {
  content: MindMapContent;
  focusRootId?: string | null;
  visibleBudget?: number;
}) {
  const { children } = treeIndex(input.content);
  const rootId = resolveRootId(input.content, input.focusRootId);
  const budget = input.visibleBudget ?? MIND_MAP_INITIAL_VISIBLE_BUDGET;
  const depthById = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (!id) continue;
    const depth = depthById.get(id) ?? 0;
    for (const childId of children.get(id) ?? []) {
      depthById.set(childId, depth + 1);
      queue.push(childId);
    }
  }

  const maximumDepth = Math.max(0, ...depthById.values());
  let visibleDepth = Math.min(1, maximumDepth);
  while (visibleDepth < maximumDepth) {
    const nextDepthCount = [...depthById.values()].filter(
      (depth) => depth <= visibleDepth + 1,
    ).length;
    if (nextDepthCount > budget) break;
    visibleDepth += 1;
  }
  if (visibleDepth >= maximumDepth) return new Set<string>();
  return new Set(
    [...depthById.entries()]
      .filter(([id, depth]) => depth === visibleDepth && (children.get(id)?.length ?? 0) > 0)
      .map(([id]) => id),
  );
}

export function collapseMindMapToFirstLevel(input: {
  content: MindMapContent;
  focusRootId?: string | null;
}) {
  const { children } = treeIndex(input.content);
  const rootId = resolveRootId(input.content, input.focusRootId);
  return new Set((children.get(rootId) ?? []).filter((id) => (children.get(id)?.length ?? 0) > 0));
}

export function revealMindMapNode(input: {
  collapsedIds: ReadonlySet<string>;
  content: MindMapContent;
  nodeId: string;
}) {
  const next = new Set(input.collapsedIds);
  for (const node of getMindMapPath(input.content, input.nodeId)) next.delete(node.id);
  return next;
}

export function layoutMindMap(input: {
  collapsedIds?: ReadonlySet<string>;
  content: MindMapContent;
  focusRootId?: string | null;
}): PositionedMindMapNode[] {
  const rootId = resolveRootId(input.content, input.focusRootId);
  const tree = treeIndex(input.content);
  const visible = getMindMapVisibleNodeIds(input);
  const visibleSet = new Set(visible);
  const visibleChildren = new Map<string, string[]>();
  for (const id of visible) {
    visibleChildren.set(
      id,
      (tree.children.get(id) ?? []).filter((childId) => visibleSet.has(childId)),
    );
  }

  const depthById = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (!id) continue;
    const depth = depthById.get(id) ?? 0;
    for (const childId of visibleChildren.get(id) ?? []) {
      depthById.set(childId, depth + 1);
      queue.push(childId);
    }
  }

  const visibleWeight = new Map<string, number>();
  const weigh = (id: string): number => {
    const weight =
      1 + (visibleChildren.get(id) ?? []).reduce((sum, childId) => sum + weigh(childId), 0);
    visibleWeight.set(id, weight);
    return weight;
  };
  weigh(rootId);

  const sideById = new Map<string, MindMapSide>([[rootId, "center"]]);
  const branchById = new Map<string, number>([[rootId, -1]]);
  const sideRoots: Record<"left" | "right", string[]> = { left: [], right: [] };
  let leftWeight = 0;
  let rightWeight = 0;
  for (const [branchIndex, branchRootId] of (visibleChildren.get(rootId) ?? []).entries()) {
    const side = rightWeight <= leftWeight ? "right" : "left";
    sideRoots[side].push(branchRootId);
    const weight = visibleWeight.get(branchRootId) ?? 1;
    if (side === "left") leftWeight += weight;
    else rightWeight += weight;
    const assign = (id: string) => {
      sideById.set(id, side);
      branchById.set(id, branchIndex);
      for (const childId of visibleChildren.get(id) ?? []) assign(childId);
    };
    assign(branchRootId);
  }

  const centerXById = new Map<string, number>([[rootId, 0]]);
  for (const side of ["left", "right"] as const) {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({
      marginx: 0,
      marginy: 0,
      nodesep: SIBLING_GAP,
      rankdir: side === "left" ? "RL" : "LR",
      ranksep: HORIZONTAL_GAP,
    });
    graph.setNode(rootId, dimensions(0));
    for (const id of visible) {
      if (sideById.get(id) !== side) continue;
      graph.setNode(id, dimensions(depthById.get(id) ?? 0));
      const parentId = tree.parentById.get(id);
      if (parentId) graph.setEdge(parentId, id);
    }
    dagre.layout(graph);
    const rootX = graph.node(rootId).x;
    for (const id of visible) {
      if (sideById.get(id) === side) centerXById.set(id, graph.node(id).x - rootX);
    }
  }

  const subtreeHeight = new Map<string, number>();
  const measure = (id: string): number => {
    const nodeHeight = dimensions(depthById.get(id) ?? 0).height;
    const childIds = visibleChildren.get(id) ?? [];
    const childrenHeight = childIds.reduce((sum, childId) => sum + measure(childId), 0);
    const gaps = Math.max(0, childIds.length - 1) * SIBLING_GAP;
    const height = Math.max(nodeHeight, childrenHeight + gaps);
    subtreeHeight.set(id, height);
    return height;
  };
  for (const branchRootId of [...sideRoots.left, ...sideRoots.right]) measure(branchRootId);

  const topById = new Map<string, number>();
  const placeSubtree = (id: string, top: number) => {
    const height = subtreeHeight.get(id) ?? dimensions(depthById.get(id) ?? 0).height;
    const nodeHeight = dimensions(depthById.get(id) ?? 0).height;
    topById.set(id, top + (height - nodeHeight) / 2);
    const childIds = visibleChildren.get(id) ?? [];
    const childrenHeight = childIds.reduce(
      (sum, childId) => sum + (subtreeHeight.get(childId) ?? 0),
      0,
    );
    const childStackHeight = childrenHeight + Math.max(0, childIds.length - 1) * SIBLING_GAP;
    let childTop = top + (height - childStackHeight) / 2;
    for (const childId of childIds) {
      placeSubtree(childId, childTop);
      childTop += (subtreeHeight.get(childId) ?? 0) + SIBLING_GAP;
    }
  };
  for (const side of ["left", "right"] as const) {
    const roots = sideRoots[side];
    const totalHeight =
      roots.reduce((sum, id) => sum + (subtreeHeight.get(id) ?? 0), 0) +
      Math.max(0, roots.length - 1) * BRANCH_GAP;
    let top = -totalHeight / 2;
    for (const id of roots) {
      placeSubtree(id, top);
      top += (subtreeHeight.get(id) ?? 0) + BRANCH_GAP;
    }
  }

  return visible.map((id) => {
    const depth = depthById.get(id) ?? 0;
    const size = dimensions(depth);
    return {
      branchIndex: branchById.get(id) ?? -1,
      depth,
      height: size.height,
      id,
      position: {
        x: (centerXById.get(id) ?? 0) - size.width / 2,
        y: id === rootId ? -size.height / 2 : (topById.get(id) ?? 0),
      },
      side: sideById.get(id) ?? "center",
      width: size.width,
    };
  });
}
