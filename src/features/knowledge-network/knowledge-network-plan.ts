import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force-3d";
import type {
  KnowledgeNetworkDiscoveryEdge,
  KnowledgeNetworkGraphPlan,
  KnowledgeNetworkTrace,
} from "./model";
import {
  calculateKnowledgeNetworkNodeMetrics,
  KNOWLEDGE_NETWORK_PHYSICS,
  type KnowledgeNetworkNodeKind,
  knowledgeNetworkDiscoveryEdges,
} from "./node-metrics";

const LAYOUT_TICKS = 420;

type LayoutNode = {
  id: string;
  kind: KnowledgeNetworkNodeKind;
  radius: number;
  x: number;
  y: number;
};

type LayoutLink = {
  source: string;
  target: string;
  kind: KnowledgeNetworkDiscoveryEdge["kind"];
};

function stableHash(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableAngle(id: string): number {
  return ((stableHash(id) % 3600) / 3600) * Math.PI * 2;
}

function nodeKindById(trace: KnowledgeNetworkTrace): Map<string, KnowledgeNetworkNodeKind> {
  const kinds = new Map<string, KnowledgeNetworkNodeKind>();
  for (const workspace of trace.workspaces) kinds.set(workspace.id, "workspace");
  for (const source of trace.sources) kinds.set(source.id, "source");
  return kinds;
}

function seedLayout(nodes: LayoutNode[], trace: KnowledgeNetworkTrace): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const workspaces = trace.workspaces.filter((workspace) => nodeById.has(workspace.id));
  const current = nodeById.get(trace.currentWorkspaceId);

  if (current) {
    current.x = 0;
    current.y = 0;
  }

  for (const workspace of workspaces) {
    if (workspace.id === trace.currentWorkspaceId) continue;
    const node = nodeById.get(workspace.id);
    if (!node) continue;
    const angle = stableAngle(workspace.id);
    const radius = 160 + (stableHash(workspace.id) % 4) * 42;
    node.x = Math.cos(angle) * radius;
    node.y = Math.sin(angle) * radius;
  }

  for (const source of trace.sources) {
    const node = nodeById.get(source.id);
    const workspace = nodeById.get(source.workspaceId);
    if (!node) continue;
    const angle = stableAngle(source.id);
    const radius = 74 + (stableHash(source.id) % 3) * 18;
    node.x = (workspace?.x ?? 0) + Math.cos(angle) * radius;
    node.y = (workspace?.y ?? 0) + Math.sin(angle) * radius;
  }
}

function computeLayout(
  trace: KnowledgeNetworkTrace,
  edges: KnowledgeNetworkDiscoveryEdge[],
  nodeMetrics: ReturnType<typeof calculateKnowledgeNetworkNodeMetrics>,
): Record<string, { x: number; y: number }> {
  const kinds = nodeKindById(trace);
  const nodes: LayoutNode[] = [...kinds.entries()].map(([id, kind]) => ({
    id,
    kind,
    radius: nodeMetrics[id]?.radius ?? 10,
    x: 0,
    y: 0,
  }));

  seedLayout(nodes, trace);

  const links: LayoutLink[] = edges.map((edge) => ({
    source: edge.fromId,
    target: edge.toId,
    kind: edge.kind,
  }));

  const simulation = forceSimulation(nodes, 2)
    .force(
      "link",
      forceLink<LayoutNode, LayoutLink>(links)
        .id((node: LayoutNode) => node.id)
        .distance((link: LayoutLink) => KNOWLEDGE_NETWORK_PHYSICS.linkDistance[link.kind])
        .strength((link: LayoutLink) => KNOWLEDGE_NETWORK_PHYSICS.linkStrength[link.kind]),
    )
    .force(
      "charge",
      forceManyBody<LayoutNode>()
        .strength((node: LayoutNode) => KNOWLEDGE_NETWORK_PHYSICS.charge[node.kind])
        .distanceMin(KNOWLEDGE_NETWORK_PHYSICS.chargeDistanceMin)
        .distanceMax(KNOWLEDGE_NETWORK_PHYSICS.chargeDistanceMax),
    )
    .force("center", forceCenter(0, 0).strength(KNOWLEDGE_NETWORK_PHYSICS.centerStrength))
    .force(
      "collision",
      forceCollide<LayoutNode>(
        (node) => node.radius + KNOWLEDGE_NETWORK_PHYSICS.collisionPadding[node.kind],
      )
        .strength(KNOWLEDGE_NETWORK_PHYSICS.collisionStrength)
        .iterations(KNOWLEDGE_NETWORK_PHYSICS.collisionIterations),
    )
    .velocityDecay(KNOWLEDGE_NETWORK_PHYSICS.velocityDecay)
    .alphaDecay(KNOWLEDGE_NETWORK_PHYSICS.alphaDecay)
    .alphaMin(KNOWLEDGE_NETWORK_PHYSICS.alphaMin)
    .stop();

  for (let index = 0; index < LAYOUT_TICKS; index += 1) simulation.tick();

  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      {
        x: Number.isFinite(node.x) ? node.x : 0,
        y: Number.isFinite(node.y) ? node.y : 0,
      },
    ]),
  );
}

export function prepareKnowledgeNetworkGraphPlan(
  trace: KnowledgeNetworkTrace,
): KnowledgeNetworkGraphPlan {
  // An empty retrieval trace may still carry placeholder Workspace/Source
  // entries for the native source list. Do not turn those placeholders into a
  // fabricated graph; a real graph with no Chunks can still be valid when the
  // trace contains Workspace references.
  if (trace.chunks.length === 0 && trace.references.length === 0) {
    return {
      layout: {},
      nodeMetrics: {},
      visibleNodeIds: [],
      visibleEdges: [],
    };
  }

  const visibleNodeIds = [
    ...trace.workspaces.map((workspace) => workspace.id),
    ...trace.sources.map((source) => source.id),
  ];
  const edges = knowledgeNetworkDiscoveryEdges(trace);
  const nodeMetrics = calculateKnowledgeNetworkNodeMetrics(trace, edges);

  if (visibleNodeIds.length === 0) {
    return {
      layout: {},
      nodeMetrics: {},
      visibleNodeIds: [],
      visibleEdges: [],
    };
  }

  return {
    layout: computeLayout(trace, edges, nodeMetrics),
    nodeMetrics,
    visibleNodeIds,
    visibleEdges: edges,
  };
}
