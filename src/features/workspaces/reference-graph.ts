import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import { sources, workspaceReferenceSources, workspaces } from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import { requireWorkspacePermission, resolveReadableWorkspaceIds } from "./access.server";
import { WorkspaceError } from "./errors";

export type WorkspaceReferenceEdge = {
  sourceId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  createdAt: string;
};

export type WorkspaceReferenceGraphNode = {
  id: string;
  name: string;
  archivedAt: string | null;
};

type WorkspaceReferencePath = {
  workspaceId: string;
  workspaceIds: string[];
  referenceSourceIds: string[];
};

export type WorkspaceReferenceGraph = {
  rootWorkspaceId: string;
  nodes: WorkspaceReferenceGraphNode[];
  edges: WorkspaceReferenceEdge[];
  paths: WorkspaceReferencePath[];
};

function compareEdges(left: WorkspaceReferenceEdge, right: WorkspaceReferenceEdge) {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.targetWorkspaceId.localeCompare(right.targetWorkspaceId)
  );
}

export function collectReachableWorkspaceGraph(
  rootWorkspaceId: string,
  nodes: readonly WorkspaceReferenceGraphNode[],
  edges: readonly WorkspaceReferenceEdge[],
): WorkspaceReferenceGraph {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const root = nodeById.get(rootWorkspaceId);
  if (!root) throw new Error("workspace_graph_root_missing");

  const adjacency = new Map<string, WorkspaceReferenceEdge[]>();
  for (const edge of edges) {
    if (!nodeById.has(edge.sourceWorkspaceId) || !nodeById.has(edge.targetWorkspaceId)) continue;
    const outgoing = adjacency.get(edge.sourceWorkspaceId) ?? [];
    outgoing.push(edge);
    adjacency.set(edge.sourceWorkspaceId, outgoing);
  }
  for (const outgoing of adjacency.values()) outgoing.sort(compareEdges);

  const reachableIds: string[] = [];
  const visited = new Set<string>();
  const pathByWorkspaceId = new Map<string, WorkspaceReferencePath>([
    [
      rootWorkspaceId,
      { workspaceId: rootWorkspaceId, workspaceIds: [rootWorkspaceId], referenceSourceIds: [] },
    ],
  ]);
  const queue = [rootWorkspaceId];
  for (let index = 0; index < queue.length; index += 1) {
    const workspaceId = queue[index];
    if (!workspaceId || visited.has(workspaceId)) continue;
    visited.add(workspaceId);
    reachableIds.push(workspaceId);
    const sourcePath = pathByWorkspaceId.get(workspaceId);
    if (!sourcePath) throw new Error("workspace_graph_path_missing");
    for (const edge of adjacency.get(workspaceId) ?? []) {
      if (!pathByWorkspaceId.has(edge.targetWorkspaceId)) {
        pathByWorkspaceId.set(edge.targetWorkspaceId, {
          workspaceId: edge.targetWorkspaceId,
          workspaceIds: [...sourcePath.workspaceIds, edge.targetWorkspaceId],
          referenceSourceIds: [...sourcePath.referenceSourceIds, edge.sourceId],
        });
      }
      if (!visited.has(edge.targetWorkspaceId)) queue.push(edge.targetWorkspaceId);
    }
  }

  const reachableSet = new Set(reachableIds);
  return {
    rootWorkspaceId,
    nodes: reachableIds.map((id) => {
      const node = nodeById.get(id);
      if (!node) throw new Error("workspace_graph_node_missing");
      return node;
    }),
    edges: edges
      .filter(
        (edge) =>
          reachableSet.has(edge.sourceWorkspaceId) && reachableSet.has(edge.targetWorkspaceId),
      )
      .sort(compareEdges),
    paths: reachableIds.map((id) => {
      const path = pathByWorkspaceId.get(id);
      if (!path) throw new Error("workspace_graph_path_missing");
      return path;
    }),
  };
}

export function collectReachableWorkspaceIds(
  rootWorkspaceId: string,
  edges: readonly WorkspaceReferenceEdge[],
): string[] {
  const nodeIds = new Set([rootWorkspaceId]);
  for (const edge of edges) {
    nodeIds.add(edge.sourceWorkspaceId);
    nodeIds.add(edge.targetWorkspaceId);
  }
  return collectReachableWorkspaceGraph(
    rootWorkspaceId,
    [...nodeIds].map((id) => ({ id, name: id, archivedAt: null })),
    edges,
  ).nodes.map((node) => node.id);
}

export async function resolveReachableWorkspaceGraph(
  actor: Actor,
  rootWorkspaceId: string,
  db: Database = database,
): Promise<WorkspaceReferenceGraph> {
  if (!z.string().uuid().safeParse(rootWorkspaceId).success) {
    throw new WorkspaceError("workspace_not_found");
  }
  await requireWorkspacePermission(actor, rootWorkspaceId, "workspace.read", db);
  const [rootWorkspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      archivedAt: workspaces.archivedAt,
    })
    .from(workspaces)
    .where(inArray(workspaces.id, [rootWorkspaceId]))
    .limit(1);
  if (!rootWorkspace) throw new WorkspaceError("workspace_not_found");

  const nodes = new Map<string, WorkspaceReferenceGraphNode>([
    [
      rootWorkspace.id,
      {
        id: rootWorkspace.id,
        name: rootWorkspace.name,
        archivedAt: rootWorkspace.archivedAt?.toISOString() ?? null,
      },
    ],
  ]);
  const edges = new Map<string, WorkspaceReferenceEdge>();
  const expanded = new Set<string>();
  let frontier = [rootWorkspaceId];

  while (frontier.length > 0) {
    const sourceWorkspaceIds = frontier.filter((workspaceId) => !expanded.has(workspaceId));
    if (sourceWorkspaceIds.length === 0) break;
    for (const workspaceId of sourceWorkspaceIds) expanded.add(workspaceId);

    const rows = await db
      .select({
        sourceId: sources.id,
        sourceWorkspaceId: workspaceReferenceSources.sourceWorkspaceId,
        targetWorkspaceId: workspaceReferenceSources.targetWorkspaceId,
        createdAt: sources.createdAt,
      })
      .from(workspaceReferenceSources)
      .innerJoin(sources, eq(sources.id, workspaceReferenceSources.sourceId))
      .where(andActiveReferences(sourceWorkspaceIds))
      .orderBy(asc(sources.createdAt), asc(sources.id));
    const unseenTargetIds = [
      ...new Set(
        rows.map((row) => row.targetWorkspaceId).filter((workspaceId) => !nodes.has(workspaceId)),
      ),
    ];
    const readableTargetIds = await resolveReadableWorkspaceIds(actor, unseenTargetIds, db, {
      requireReferenceable: true,
    });
    const readableTargets =
      readableTargetIds.size === 0
        ? []
        : await db
            .select({
              id: workspaces.id,
              name: workspaces.name,
              archivedAt: workspaces.archivedAt,
            })
            .from(workspaces)
            .where(inArray(workspaces.id, [...readableTargetIds]))
            .orderBy(asc(workspaces.id));
    for (const workspace of readableTargets) {
      nodes.set(workspace.id, {
        id: workspace.id,
        name: workspace.name,
        archivedAt: workspace.archivedAt?.toISOString() ?? null,
      });
    }

    frontier = [];
    for (const row of rows) {
      if (!nodes.has(row.targetWorkspaceId)) continue;
      edges.set(row.sourceId, {
        ...row,
        createdAt: row.createdAt.toISOString(),
      });
      if (!expanded.has(row.targetWorkspaceId)) frontier.push(row.targetWorkspaceId);
    }
  }

  return collectReachableWorkspaceGraph(rootWorkspaceId, [...nodes.values()], [...edges.values()]);
}

export async function resolveReachableWorkspaceIds(
  actor: Actor,
  rootWorkspaceId: string,
  db: Database = database,
): Promise<string[]> {
  const graph = await resolveReachableWorkspaceGraph(actor, rootWorkspaceId, db);
  return graph.nodes.map((node) => node.id);
}

function andActiveReferences(sourceWorkspaceIds: string[]) {
  return and(
    inArray(workspaceReferenceSources.sourceWorkspaceId, sourceWorkspaceIds),
    isNull(sources.deletedAt),
  );
}
