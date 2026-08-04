import { describe, expect, test } from "vitest";
import {
  circularExpandedKnowledgeNetworkTrace,
  emptyKnowledgeNetworkTrace,
  incrementalKnowledgeNetworkTrace,
  referenceKnowledgeNetworkTrace,
} from "./fixtures";
import { prepareKnowledgeNetworkGraphPlan } from "./knowledge-network-plan";
import {
  chunkSelectionState,
  directKnowledgeNetworkSourceEntries,
  isCited,
  knowledgeNetworkReturnViewForTrace,
  mergeKnowledgeNetworkTraces,
  stableWorkspacePath,
  workspaceNavigationTarget,
} from "./model";
import {
  calculateKnowledgeNetworkNodeMetrics,
  knowledgeNetworkDiscoveryEdges,
  knowledgeNetworkNodeRadius,
  projectKnowledgeNetworkEvidencePaths,
  visibleCitationPath,
  visibleEvidencePath,
} from "./node-metrics";

describe("knowledge network graph model", () => {
  test("precomputes a complete Workspace + Source graph without Chunks", () => {
    const plan = prepareKnowledgeNetworkGraphPlan(circularExpandedKnowledgeNetworkTrace);
    const repeatedPlan = prepareKnowledgeNetworkGraphPlan(circularExpandedKnowledgeNetworkTrace);
    const workspaceIds = circularExpandedKnowledgeNetworkTrace.workspaces.map((item) => item.id);
    const sourceIds = circularExpandedKnowledgeNetworkTrace.sources.map((item) => item.id);
    const chunkIds = new Set(circularExpandedKnowledgeNetworkTrace.chunks.map((item) => item.id));

    expect(plan.visibleNodeIds).toHaveLength(121);
    expect(plan.visibleNodeIds).toEqual([...workspaceIds, ...sourceIds]);
    expect(plan.visibleNodeIds.some((id) => chunkIds.has(id))).toBe(false);
    expect(Object.keys(plan.layout).sort()).toEqual([...workspaceIds, ...sourceIds].sort());
    expect(Object.keys(plan.nodeMetrics).sort()).toEqual([...workspaceIds, ...sourceIds].sort());
    expect(
      plan.visibleEdges.every((edge) => edge.kind === "workspace" || edge.kind === "source"),
    ).toBe(true);
    expect(
      plan.visibleEdges.some((edge) => chunkIds.has(edge.fromId) || chunkIds.has(edge.toId)),
    ).toBe(false);
    expect(plan.layout).toEqual(repeatedPlan.layout);
    expect(plan.nodeMetrics).toEqual(repeatedPlan.nodeMetrics);
  });

  test("uses one Obsidian-inspired degree radius function for both node kinds", () => {
    const metrics = calculateKnowledgeNetworkNodeMetrics(circularExpandedKnowledgeNetworkTrace);
    const root = metrics[circularExpandedKnowledgeNetworkTrace.currentWorkspaceId];
    const source = metrics[circularExpandedKnowledgeNetworkTrace.sources[0]?.id ?? "missing"];

    expect(root?.radius).toBe(knowledgeNetworkNodeRadius(root?.weight ?? 0));
    expect(source?.radius).toBe(knowledgeNetworkNodeRadius(source?.weight ?? 0));
    expect(root?.radius).not.toBeGreaterThan(34);
    expect(metrics["chunk-did-architecture"]).toBeUndefined();
    expect(Math.max(...Object.values(metrics).map((metric) => metric.radius))).toBeGreaterThan(
      Math.min(...Object.values(metrics).map((metric) => metric.radius)),
    );
  });

  test("counts visible inbound and outbound edges as degree", () => {
    const edges = knowledgeNetworkDiscoveryEdges(referenceKnowledgeNetworkTrace);
    const metrics = calculateKnowledgeNetworkNodeMetrics(referenceKnowledgeNetworkTrace, edges);
    const root = metrics[referenceKnowledgeNetworkTrace.currentWorkspaceId];
    const rootDegree = edges.filter(
      (edge) =>
        edge.fromId === referenceKnowledgeNetworkTrace.currentWorkspaceId ||
        edge.toId === referenceKnowledgeNetworkTrace.currentWorkspaceId,
    ).length;

    expect(root?.weight).toBe(rootDegree);
    expect((root?.inbound ?? 0) + (root?.outbound ?? 0)).toBe(rootDegree);
  });

  test("keeps cycles and diamond references as unique trace-backed edges", () => {
    const edges = knowledgeNetworkDiscoveryEdges(referenceKnowledgeNetworkTrace);
    const edgeIds = edges.map((edge) => edge.id);
    const connections = edges.map((edge) => `${edge.fromId}->${edge.toId}`);

    expect(edgeIds).toContain("workspace-reference:reference-d-a");
    expect(edgeIds).toContain("workspace-reference:reference-c-d");
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
    expect(new Set(connections).size).toBe(connections.length);
  });

  test("does not invent a graph for an empty trace", () => {
    const plan = prepareKnowledgeNetworkGraphPlan(emptyKnowledgeNetworkTrace);

    expect(plan.visibleNodeIds).toHaveLength(0);
    expect(plan.visibleEdges).toHaveLength(0);
    expect(plan.layout).toEqual({});
    expect(plan.nodeMetrics).toEqual({});
  });

  test("keeps Workspace and Source nodes visible when the trace has no Chunks", () => {
    const traceWithoutChunks = {
      ...referenceKnowledgeNetworkTrace,
      id: "reference-without-chunks",
      chunks: [],
      paths: [],
      selectedChunkIds: [],
      citedChunkIds: [],
    };
    const plan = prepareKnowledgeNetworkGraphPlan(traceWithoutChunks);

    expect(plan.visibleNodeIds).toHaveLength(
      traceWithoutChunks.workspaces.length + traceWithoutChunks.sources.length,
    );
    expect(plan.visibleEdges.length).toBeGreaterThan(0);
    expect(Object.keys(plan.layout)).toHaveLength(plan.visibleNodeIds.length);
  });

  test("lists direct file and Workspace Sources before indirect discovery", () => {
    const entries = directKnowledgeNetworkSourceEntries(referenceKnowledgeNetworkTrace);

    expect(entries.map((entry) => entry.kind)).toEqual([
      "workspace",
      "workspace",
      "workspace",
      "source",
    ]);
    expect(
      entries.map((entry) => (entry.kind === "workspace" ? entry.workspace.id : entry.source.id)),
    ).toEqual([
      "workspace-human-computer-interaction",
      "workspace-blockchain",
      "workspace-digital-identity",
      "source-hci-basics",
    ]);
    expect(
      entries.some(
        (entry) =>
          entry.kind === "workspace" && entry.workspace.id === "workspace-verifiable-credentials",
      ),
    ).toBe(false);
  });

  test("resolves graph nodes to trace-backed Workspace navigation targets", () => {
    expect(
      workspaceNavigationTarget(referenceKnowledgeNetworkTrace, "workspace-digital-identity"),
    ).toEqual({
      workspaceId: "workspace-digital-identity",
      sourceId: null,
      reason: "workspace-node",
    });
    expect(workspaceNavigationTarget(referenceKnowledgeNetworkTrace, "source-did-review")).toEqual({
      workspaceId: "workspace-blockchain",
      sourceId: "source-did-review",
      reason: "source-node",
    });
    expect(
      workspaceNavigationTarget(referenceKnowledgeNetworkTrace, "source-hci-basics"),
    ).toMatchObject({
      workspaceId: referenceKnowledgeNetworkTrace.currentWorkspaceId,
      sourceId: "source-hci-basics",
    });
    expect(workspaceNavigationTarget(referenceKnowledgeNetworkTrace, "missing-node")).toBeNull();
  });

  test("restores a temporary Workspace view only for its owning Trace", () => {
    const returnView = {
      traceId: "trace-a",
      sourceMode: "network" as const,
      selectedNodeId: "source-did-review",
      citationSourceId: "source-did-review",
      requestId: 4,
    };

    expect(knowledgeNetworkReturnViewForTrace("trace-a", returnView)).toEqual(returnView);
    expect(knowledgeNetworkReturnViewForTrace("trace-b", returnView)).toBeNull();
    expect(knowledgeNetworkReturnViewForTrace("trace-a", null)).toBeNull();
  });

  test("keeps selected, candidate and cited states distinct", () => {
    expect(chunkSelectionState(referenceKnowledgeNetworkTrace, "chunk-did-architecture")).toBe(
      "selected",
    );
    expect(chunkSelectionState(referenceKnowledgeNetworkTrace, "chunk-central-provider")).toBe(
      "candidate-unselected",
    );
    expect(chunkSelectionState(referenceKnowledgeNetworkTrace, "unknown-chunk")).toBe("hidden");
    expect(isCited(referenceKnowledgeNetworkTrace, "chunk-did-architecture")).toBe(true);
    expect(isCited(referenceKnowledgeNetworkTrace, "chunk-user-authorization")).toBe(false);
  });

  test("projects selected and cited evidence onto only valid visible paths", () => {
    const plan = prepareKnowledgeNetworkGraphPlan(referenceKnowledgeNetworkTrace);
    const projection = projectKnowledgeNetworkEvidencePaths(
      referenceKnowledgeNetworkTrace,
      plan.visibleEdges,
    );
    const visibleIds = new Set(plan.visibleNodeIds);

    expect([...projection.activeNodeIds].every((id) => visibleIds.has(id))).toBe(true);
    expect([...projection.activeNodeIds].every((id) => !id.startsWith("chunk-"))).toBe(true);

    for (const chunkId of referenceKnowledgeNetworkTrace.citedChunkIds) {
      const path = visibleEvidencePath(referenceKnowledgeNetworkTrace, chunkId);
      expect(path).not.toBeNull();
      for (let index = 1; index < (path?.length ?? 0); index += 1) {
        const fromId = path?.[index - 1];
        const toId = path?.[index];
        const edge = plan.visibleEdges.find(
          (candidate) => candidate.fromId === fromId && candidate.toId === toId,
        );
        expect(edge ? projection.edgeStates.get(edge.id) : undefined).toBe("cited");
      }
    }
  });

  test("merges a second trace while keeping Chunks out of graph data", () => {
    const merged = mergeKnowledgeNetworkTraces(
      referenceKnowledgeNetworkTrace,
      incrementalKnowledgeNetworkTrace,
    );
    const plan = prepareKnowledgeNetworkGraphPlan(merged);

    expect(merged.chunks).toHaveLength(referenceKnowledgeNetworkTrace.chunks.length + 1);
    expect(merged.selectedChunkIds).toContain("chunk-minimal-disclosure");
    expect(merged.citedChunkIds).toContain("chunk-minimal-disclosure");
    expect(plan.layout).not.toHaveProperty("chunk-minimal-disclosure");
  });

  test("uses the same stable path for a repeated reference", () => {
    expect(
      stableWorkspacePath(referenceKnowledgeNetworkTrace, "workspace-verifiable-credentials"),
    ).toEqual([
      "workspace-human-computer-interaction",
      "workspace-blockchain",
      "workspace-verifiable-credentials",
    ]);
  });

  test("keeps selected evidence attached to declared canonical paths", () => {
    for (const trace of [
      referenceKnowledgeNetworkTrace,
      incrementalKnowledgeNetworkTrace,
      circularExpandedKnowledgeNetworkTrace,
    ]) {
      const sourceById = new Map(trace.sources.map((source) => [source.id, source]));
      const evidenceChunkIds = new Set([...trace.selectedChunkIds, ...trace.citedChunkIds]);

      for (const chunkId of evidenceChunkIds) {
        const chunk = trace.chunks.find((item) => item.id === chunkId);
        const source = chunk ? sourceById.get(chunk.sourceId) : undefined;
        const path = trace.paths.find((item) => item.chunkId === chunkId);

        expect(chunk).toBeDefined();
        expect(source).toBeDefined();
        expect(path).toMatchObject({ chunkId, sourceId: source?.id });
        expect(path?.workspaceIds.at(-1)).toBe(source?.workspaceId);
      }
    }
  });

  test("resolves citation focus from a real declared path", () => {
    expect(visibleCitationPath(referenceKnowledgeNetworkTrace, "source-did-review")).toEqual([
      "workspace-human-computer-interaction",
      "workspace-blockchain",
      "source-did-review",
    ]);
  });

  test("does not draw a citation path when an explicit path is invalid", () => {
    const traceWithInvalidPath = {
      ...referenceKnowledgeNetworkTrace,
      paths: referenceKnowledgeNetworkTrace.paths.map((path) =>
        path.sourceId === "source-did-review"
          ? { ...path, workspaceIds: ["workspace-human-computer-interaction", "missing"] }
          : path,
      ),
    };

    expect(visibleCitationPath(traceWithInvalidPath, "source-did-review")).toBeNull();
  });
});
