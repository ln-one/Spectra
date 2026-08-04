import type { ArtifactSourceKind } from "@/features/artifacts/types";
import type { ArtifactTone } from "@/features/artifacts/ui/artifact-presentation";
import type { SourceVisualFamily } from "@/features/sources/presentation";

export type KnowledgeNetworkWorkspace = {
  id: string;
  name: string;
  detail: string;
  relation: "current" | "referenced";
};

type KnowledgeNetworkReference = {
  id: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
};

export type KnowledgeNetworkSource = {
  id: string;
  workspaceId: string;
  name: string;
  detail: string;
  family: Exclude<SourceVisualFamily, "workspace">;
  artifactKind?: ArtifactSourceKind;
  artifactTone?: ArtifactTone;
  chunkCount: number;
};

export type KnowledgeNetworkChunk = {
  id: string;
  sourceId: string;
  label: string;
  locator: string;
  rank: number;
};

export type KnowledgeNetworkPath = {
  id: string;
  workspaceIds: string[];
  sourceId?: string;
  chunkId?: string;
};

export type KnowledgeNetworkDiscoveryEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: "workspace" | "source";
};

export type KnowledgeNetworkNodeVisualMetric = {
  weight: number;
  radius: number;
  inbound: number;
  outbound: number;
};

export type KnowledgeNetworkGraphPlan = {
  layout: Record<string, { x: number; y: number }>;
  nodeMetrics: Record<string, KnowledgeNetworkNodeVisualMetric>;
  visibleNodeIds: string[];
  visibleEdges: KnowledgeNetworkDiscoveryEdge[];
};

export type KnowledgeNetworkTrace = {
  id: string;
  query: string;
  answer?: {
    streaming: string;
    completed: string;
  };
  currentWorkspaceId: string;
  workspaces: KnowledgeNetworkWorkspace[];
  references: KnowledgeNetworkReference[];
  sources: KnowledgeNetworkSource[];
  chunks: KnowledgeNetworkChunk[];
  paths: KnowledgeNetworkPath[];
  selectedChunkIds: string[];
  citedChunkIds: string[];
};

export type KnowledgeNetworkSourceMode = "list" | "network";

type KnowledgeNetworkWorkspaceNavigationReason = "source-node" | "workspace-node";

export type KnowledgeNetworkWorkspaceNavigationTarget = {
  workspaceId: string;
  sourceId: string | null;
  reason: KnowledgeNetworkWorkspaceNavigationReason;
};

export type KnowledgeNetworkWorkspaceReturnView = {
  traceId: string;
  sourceMode: "network";
  selectedNodeId: string;
  citationSourceId: string | null;
  requestId: number;
};

export type KnowledgeNetworkWorkspaceNavigationContext = {
  originWorkspaceId: string;
  targetWorkspaceId: string;
  sourceId: string | null;
  reason: KnowledgeNetworkWorkspaceNavigationReason;
  requestId: number;
  returnView: KnowledgeNetworkWorkspaceReturnView;
};

export function knowledgeNetworkReturnViewForTrace(
  traceId: string,
  view?: KnowledgeNetworkWorkspaceReturnView | null,
): KnowledgeNetworkWorkspaceReturnView | null {
  return view?.traceId === traceId ? view : null;
}

export type KnowledgeNetworkLabels = {
  studioTitle: string;
  studioSubtitle: string;
  studioExpand: string;
  assistantTitle: string;
  assistantSubtitle: string;
  assistantGrounding: string;
  sourceTitle: string;
  sourceListSummary: string;
  workspaceSourceType: string;
  workspaceSourceStatus: string;
  networkSummary: string;
  importLabel: string;
  switchToList: string;
  switchToNetwork: string;
  currentWorkspace: string;
  referencedWorkspace: string;
};

export type KnowledgeNetworkNodeSelectionLabels = {
  workspace: string;
  source: string;
  owner: string;
  connections: (count: number) => string;
  sources: (count: number) => string;
  chunks: (count: number) => string;
  selectedEvidence: string;
  close: string;
  detailsTitle: string;
  sourceListTitle: string;
  currentWorkspace: string;
  referencedWorkspace: string;
  enterWorkspace: string;
  enterOwnerWorkspace: string;
};

export const ZH_KNOWLEDGE_NETWORK_NODE_SELECTION_LABELS: KnowledgeNetworkNodeSelectionLabels = {
  workspace: "Workspace",
  source: "Source",
  owner: "所属 Workspace",
  connections: (count) => `${count} 个连接`,
  sources: (count) => `${count} 个 Source`,
  chunks: (count) => `${count} 个 Chunk`,
  selectedEvidence: "当前证据",
  close: "关闭节点信息",
  detailsTitle: "节点详情",
  sourceListTitle: "包含的资料",
  currentWorkspace: "当前 Workspace",
  referencedWorkspace: "引用 Workspace",
  enterWorkspace: "进入 Workspace",
  enterOwnerWorkspace: "进入所属 Workspace",
};

export function workspaceNavigationTarget(
  trace: KnowledgeNetworkTrace,
  nodeId: string,
): KnowledgeNetworkWorkspaceNavigationTarget | null {
  if (trace.workspaces.some((workspace) => workspace.id === nodeId)) {
    return {
      workspaceId: nodeId,
      sourceId: null,
      reason: "workspace-node",
    };
  }

  const source = trace.sources.find((candidate) => candidate.id === nodeId);
  if (!source || !trace.workspaces.some((workspace) => workspace.id === source.workspaceId)) {
    return null;
  }

  return {
    workspaceId: source.workspaceId,
    sourceId: source.id,
    reason: "source-node",
  };
}

export function chunkSelectionState(
  trace: KnowledgeNetworkTrace,
  chunkId: string,
): "selected" | "candidate-unselected" | "hidden" {
  if (trace.selectedChunkIds.includes(chunkId)) return "selected";
  if (trace.chunks.some((chunk) => chunk.id === chunkId)) return "candidate-unselected";
  return "hidden";
}

export function isCited(trace: KnowledgeNetworkTrace, chunkId: string): boolean {
  return trace.citedChunkIds.includes(chunkId);
}

function orderedReferences(
  trace: Pick<KnowledgeNetworkTrace, "references">,
  workspaceId: string,
): KnowledgeNetworkReference[] {
  return trace.references
    .filter((reference) => reference.sourceWorkspaceId === workspaceId)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
}

export type KnowledgeNetworkSourceListEntry =
  | { kind: "source"; source: KnowledgeNetworkSource }
  | { kind: "workspace"; workspace: KnowledgeNetworkWorkspace };

export function directKnowledgeNetworkSourceEntries(
  trace: KnowledgeNetworkTrace,
): KnowledgeNetworkSourceListEntry[] {
  const workspaceById = new Map(trace.workspaces.map((workspace) => [workspace.id, workspace]));
  const currentWorkspace = workspaceById.get(trace.currentWorkspaceId);
  const directWorkspaces = [
    ...new Set(
      trace.references
        .filter((reference) => reference.sourceWorkspaceId === trace.currentWorkspaceId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((reference) => reference.targetWorkspaceId),
    ),
  ]
    .map((workspaceId) => workspaceById.get(workspaceId))
    .filter((workspace): workspace is KnowledgeNetworkWorkspace => Boolean(workspace));
  const directSources = trace.sources.filter(
    (source) => source.workspaceId === trace.currentWorkspaceId,
  );

  return [
    ...(currentWorkspace ? [{ kind: "workspace" as const, workspace: currentWorkspace }] : []),
    ...directWorkspaces.map((workspace) => ({ kind: "workspace" as const, workspace })),
    ...directSources.map((source) => ({ kind: "source" as const, source })),
  ];
}

export function stableWorkspacePath(
  trace: KnowledgeNetworkTrace,
  targetWorkspaceId: string,
): string[] | null {
  if (trace.currentWorkspaceId === targetWorkspaceId) return [targetWorkspaceId];
  if (!trace.workspaces.some((workspace) => workspace.id === targetWorkspaceId)) return null;

  const queue: string[][] = [[trace.currentWorkspaceId]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) continue;
    const currentWorkspaceId = path[path.length - 1];
    if (!currentWorkspaceId || visited.has(currentWorkspaceId)) continue;
    visited.add(currentWorkspaceId);

    for (const reference of orderedReferences(trace, currentWorkspaceId)) {
      if (path.includes(reference.targetWorkspaceId)) continue;
      const nextPath = [...path, reference.targetWorkspaceId];
      if (reference.targetWorkspaceId === targetWorkspaceId) return nextPath;
      queue.push(nextPath);
    }
  }

  return null;
}

export function mergeKnowledgeNetworkTraces(
  base: KnowledgeNetworkTrace,
  next: KnowledgeNetworkTrace,
): KnowledgeNetworkTrace {
  const uniqueById = <T extends { id: string }>(items: T[]) => [
    ...new Map(items.map((item) => [item.id, item])).values(),
  ];

  return {
    ...base,
    id: `${base.id}+${next.id}`,
    query: next.query,
    workspaces: uniqueById([...base.workspaces, ...next.workspaces]),
    references: uniqueById([...base.references, ...next.references]),
    sources: uniqueById([...base.sources, ...next.sources]),
    chunks: uniqueById([...base.chunks, ...next.chunks]),
    paths: uniqueById([...base.paths, ...next.paths]),
    selectedChunkIds: [...new Set([...base.selectedChunkIds, ...next.selectedChunkIds])],
    citedChunkIds: [...new Set([...base.citedChunkIds, ...next.citedChunkIds])],
  };
}
