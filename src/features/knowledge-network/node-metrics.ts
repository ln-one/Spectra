import {
  type KnowledgeNetworkDiscoveryEdge,
  type KnowledgeNetworkNodeVisualMetric,
  type KnowledgeNetworkTrace,
  stableWorkspacePath,
} from "./model";

export type KnowledgeNetworkNodeKind = "workspace" | "source";

const PERSONALIZED_PAGERANK_RESTART = 0.4;
const PERSONALIZED_PAGERANK_ITERATIONS = 16;
const KNOWLEDGE_NETWORK_NODE_MIN_RADIUS = 8;
const KNOWLEDGE_NETWORK_NODE_MAX_RADIUS = 20;

export const KNOWLEDGE_NETWORK_PHYSICS = {
  linkDistance: {
    workspace: 128,
    source: 86,
  },
  linkStrength: {
    workspace: 0.36,
    source: 0.22,
  },
  charge: {
    workspace: -92,
    source: -24,
  },
  collisionPadding: {
    workspace: 4,
    source: 3,
  },
  collisionStrength: 0.9,
  collisionIterations: 2,
  chargeDistanceMin: 1,
  chargeDistanceMax: 360,
  centerStrength: 0.06,
  velocityDecay: 0.4,
  alphaDecay: 0.0228,
  alphaMin: 0.001,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function knowledgeNetworkNodeRadius(relevance: number): number {
  return (
    KNOWLEDGE_NETWORK_NODE_MIN_RADIUS +
    (KNOWLEDGE_NETWORK_NODE_MAX_RADIUS - KNOWLEDGE_NETWORK_NODE_MIN_RADIUS) *
      Math.sqrt(clamp(relevance, 0, 1))
  );
}

function nodeKindById(trace: KnowledgeNetworkTrace): Map<string, KnowledgeNetworkNodeKind> {
  const entries: Array<[string, KnowledgeNetworkNodeKind]> = [];
  for (const workspace of trace.workspaces) entries.push([workspace.id, "workspace"]);
  for (const source of trace.sources) entries.push([source.id, "source"]);
  return new Map(entries);
}

function personalizedPageRank(
  currentWorkspaceId: string,
  nodeIds: Iterable<string>,
  edges: KnowledgeNetworkDiscoveryEdge[],
): Map<string, number> {
  const ids = [...nodeIds];
  const adjacency = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const edge of edges) {
    adjacency.get(edge.fromId)?.add(edge.toId);
    adjacency.get(edge.toId)?.add(edge.fromId);
  }

  let scores = new Map(ids.map((id) => [id, id === currentWorkspaceId ? 1 : 0]));
  for (let iteration = 0; iteration < PERSONALIZED_PAGERANK_ITERATIONS; iteration += 1) {
    const next = new Map(ids.map((id) => [id, 0]));
    next.set(currentWorkspaceId, PERSONALIZED_PAGERANK_RESTART);
    for (const id of ids) {
      const score = scores.get(id) ?? 0;
      const neighbors = adjacency.get(id);
      if (!neighbors || neighbors.size === 0) {
        next.set(
          currentWorkspaceId,
          (next.get(currentWorkspaceId) ?? 0) + (1 - PERSONALIZED_PAGERANK_RESTART) * score,
        );
        continue;
      }
      const share = ((1 - PERSONALIZED_PAGERANK_RESTART) * score) / neighbors.size;
      for (const neighborId of neighbors) {
        next.set(neighborId, (next.get(neighborId) ?? 0) + share);
      }
    }
    scores = next;
  }
  return scores;
}

export function knowledgeNetworkDiscoveryEdges(
  trace: KnowledgeNetworkTrace,
): KnowledgeNetworkDiscoveryEdge[] {
  const workspaceIds = new Set(trace.workspaces.map((workspace) => workspace.id));
  const edgeIds = new Set<string>();
  const edges: KnowledgeNetworkDiscoveryEdge[] = [];

  for (const reference of trace.references) {
    if (
      !workspaceIds.has(reference.sourceWorkspaceId) ||
      !workspaceIds.has(reference.targetWorkspaceId) ||
      reference.sourceWorkspaceId === reference.targetWorkspaceId
    ) {
      continue;
    }
    const id = `workspace-reference:${reference.id}`;
    if (edgeIds.has(id)) continue;
    edgeIds.add(id);
    edges.push({
      id,
      fromId: reference.sourceWorkspaceId,
      toId: reference.targetWorkspaceId,
      kind: "workspace",
    });
  }

  for (const source of trace.sources) {
    if (!workspaceIds.has(source.workspaceId)) continue;
    const id = `workspace-source:${source.workspaceId}:${source.id}`;
    if (edgeIds.has(id)) continue;
    edgeIds.add(id);
    edges.push({
      id,
      fromId: source.workspaceId,
      toId: source.id,
      kind: "source",
    });
  }

  return edges;
}

export function calculateKnowledgeNetworkNodeMetrics(
  trace: KnowledgeNetworkTrace,
  edges = knowledgeNetworkDiscoveryEdges(trace),
): Record<string, KnowledgeNetworkNodeVisualMetric> {
  const kinds = nodeKindById(trace);
  const relevance = personalizedPageRank(trace.currentWorkspaceId, kinds.keys(), edges);
  const maximumRelevance = Math.max(...relevance.values(), 0);
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();

  for (const edge of edges) {
    if (!kinds.has(edge.fromId) || !kinds.has(edge.toId)) continue;
    outbound.set(edge.fromId, (outbound.get(edge.fromId) ?? 0) + 1);
    inbound.set(edge.toId, (inbound.get(edge.toId) ?? 0) + 1);
  }

  const metrics: Record<string, KnowledgeNetworkNodeVisualMetric> = {};
  for (const [id] of kinds) {
    const nodeInbound = inbound.get(id) ?? 0;
    const nodeOutbound = outbound.get(id) ?? 0;
    const weight = nodeInbound + nodeOutbound;
    metrics[id] = {
      weight,
      radius: knowledgeNetworkNodeRadius(
        maximumRelevance === 0 ? 0 : (relevance.get(id) ?? 0) / maximumRelevance,
      ),
      inbound: nodeInbound,
      outbound: nodeOutbound,
    };
  }

  return metrics;
}

type KnowledgeNetworkEvidencePathState = "selected" | "cited";

export type KnowledgeNetworkEvidenceProjection = {
  activeNodeIds: Set<string>;
  edgeStates: Map<string, KnowledgeNetworkEvidencePathState>;
};

function edgeKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

function validWorkspacePath(
  trace: KnowledgeNetworkTrace,
  workspaceIds: string[],
  sourceWorkspaceId: string,
): string[] | null {
  if (workspaceIds.length === 0) return null;
  const workspaceSet = new Set(trace.workspaces.map((workspace) => workspace.id));
  if (
    workspaceIds.some((workspaceId) => !workspaceSet.has(workspaceId)) ||
    workspaceIds[0] !== trace.currentWorkspaceId ||
    new Set(workspaceIds).size !== workspaceIds.length ||
    workspaceIds[workspaceIds.length - 1] !== sourceWorkspaceId
  ) {
    return null;
  }

  for (let index = 1; index < workspaceIds.length; index += 1) {
    const fromId = workspaceIds[index - 1];
    const toId = workspaceIds[index];
    if (
      !trace.references.some(
        (reference) =>
          reference.sourceWorkspaceId === fromId && reference.targetWorkspaceId === toId,
      )
    ) {
      return null;
    }
  }

  return workspaceIds;
}

export function visibleEvidencePath(
  trace: KnowledgeNetworkTrace,
  chunkId: string,
): string[] | null {
  const chunk = trace.chunks.find((candidate) => candidate.id === chunkId);
  if (!chunk) return null;
  const source = trace.sources.find((candidate) => candidate.id === chunk.sourceId);
  if (!source) return null;
  const declaredPath = trace.paths.find((path) => path.chunkId === chunkId);
  if (!declaredPath || declaredPath.sourceId !== source.id) return null;

  const workspaceIds = validWorkspacePath(trace, declaredPath.workspaceIds, source.workspaceId);
  if (!workspaceIds) return null;
  return [...workspaceIds, source.id];
}

function visibleSourcePath(trace: KnowledgeNetworkTrace, sourceId: string): string[] | null {
  const source = trace.sources.find((candidate) => candidate.id === sourceId);
  if (!source) return null;
  const workspaceIds = stableWorkspacePath(trace, source.workspaceId);
  if (!workspaceIds) return null;
  return [...workspaceIds, source.id];
}

/**
 * Resolve the temporary path opened from an assistant citation.
 *
 * Prefer a declared chunk path when the trace has one for this Source. If a
 * Source has no declared evidence path, the path may still be derived from
 * the real Workspace reference graph. An explicitly declared but invalid path
 * never falls back to a made-up connection.
 */
export function visibleCitationPath(
  trace: KnowledgeNetworkTrace,
  sourceId: string,
): string[] | null {
  const source = trace.sources.find((candidate) => candidate.id === sourceId);
  if (!source) return null;

  const declaredPaths = trace.paths.filter((path) => path.sourceId === sourceId);
  if (declaredPaths.length > 0) {
    for (const declaredPath of declaredPaths) {
      const workspaceIds = validWorkspacePath(trace, declaredPath.workspaceIds, source.workspaceId);
      if (workspaceIds) return [...workspaceIds, source.id];
    }
    return null;
  }

  return visibleSourcePath(trace, sourceId);
}

export function projectKnowledgeNetworkEvidencePaths(
  trace: KnowledgeNetworkTrace,
  edges: KnowledgeNetworkDiscoveryEdge[] = knowledgeNetworkDiscoveryEdges(trace),
  selectedId: string | null = null,
): KnowledgeNetworkEvidenceProjection {
  const edgeByKey = new Map(edges.map((edge) => [edgeKey(edge.fromId, edge.toId), edge.id]));
  const activeNodeIds = new Set<string>();
  const edgeStates = new Map<string, KnowledgeNetworkEvidencePathState>();
  const chunkState = new Map<string, KnowledgeNetworkEvidencePathState>();

  for (const chunkId of trace.selectedChunkIds) chunkState.set(chunkId, "selected");
  for (const chunkId of trace.citedChunkIds) chunkState.set(chunkId, "cited");
  if (selectedId && trace.chunks.some((chunk) => chunk.id === selectedId)) {
    if (!chunkState.has(selectedId)) chunkState.set(selectedId, "selected");
  }

  for (const [chunkId, state] of chunkState) {
    const path = visibleEvidencePath(trace, chunkId);
    if (!path) continue;
    for (const nodeId of path) activeNodeIds.add(nodeId);
    for (let index = 1; index < path.length; index += 1) {
      const fromId = path[index - 1];
      const toId = path[index];
      if (!fromId || !toId) continue;
      const id = edgeByKey.get(edgeKey(fromId, toId));
      if (!id) continue;
      const current = edgeStates.get(id);
      if (current === "cited" || (current === "selected" && state === "selected")) continue;
      edgeStates.set(id, state);
    }
  }

  if (selectedId && !trace.chunks.some((chunk) => chunk.id === selectedId)) {
    const path = visibleSourcePath(trace, selectedId);
    if (path) {
      for (const nodeId of path) activeNodeIds.add(nodeId);
      for (let index = 1; index < path.length; index += 1) {
        const fromId = path[index - 1];
        const toId = path[index];
        if (!fromId || !toId) continue;
        const id = edgeByKey.get(edgeKey(fromId, toId));
        if (id && !edgeStates.has(id)) edgeStates.set(id, "selected");
      }
    }
  }

  return { activeNodeIds, edgeStates };
}
