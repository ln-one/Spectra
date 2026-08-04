import { describe, expect, it } from "vitest";
import { DEFAULT_GRAPH_VIEW_FORCES, degreeWeightedRadius } from "./forces";
import { GraphViewEngine } from "./graph-view-engine";
import type { GraphViewWorkerRequest, GraphViewWorkerResponse } from "./types";

class FakeWorker {
  onmessage: ((event: MessageEvent<GraphViewWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: GraphViewWorkerRequest[] = [];
  terminated = false;

  postMessage(message: GraphViewWorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: GraphViewWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<GraphViewWorkerResponse>);
  }
}

function requestWithSequence(
  request: GraphViewWorkerRequest | undefined,
): Extract<GraphViewWorkerRequest, { sequence: number }> {
  if (!request || !("sequence" in request)) {
    throw new Error("Expected a worker request with a stream sequence");
  }
  return request;
}

function createEngine(worker: FakeWorker): GraphViewEngine {
  return new GraphViewEngine({
    createWorker: () => worker as unknown as Worker,
  });
}

describe("GraphViewEngine", () => {
  it("uses the mechanically recovered force defaults", () => {
    expect(DEFAULT_GRAPH_VIEW_FORCES).toMatchObject({
      centerStrength: 0.1,
      repelStrength: 1000,
      linkStrength: 1,
      linkDistance: 250,
      collisionRadius: 60,
      collisionStrength: 0.5,
      collisionIterations: 1,
      velocityDecay: 0.6,
      alphaMin: 0.001,
    });
  });

  it("uses the degree-weighted radius curve", () => {
    expect(degreeWeightedRadius(0)).toBe(8);
    expect(degreeWeightedRadius(8)).toBeCloseTo(9, 5);
    expect(degreeWeightedRadius(10000)).toBe(30);
    expect(degreeWeightedRadius(8, 1.5)).toBeCloseTo(13.5, 5);
  });

  it("keeps existing node objects and filters invalid links", () => {
    const worker = new FakeWorker();
    const engine = createEngine(worker);

    engine.setData({
      nodes: [
        { id: "root", x: 0, y: 0, radius: 12 },
        { id: "source", x: 120, y: 0, radius: 8 },
      ],
      links: [
        { id: "root-source", source: "root", target: "source" },
        { id: "duplicate", source: "root", target: "source" },
        { source: "root", target: "root" },
        { source: "missing", target: "root" },
      ],
    });

    const firstGraph = engine.getGraphData();
    const root = firstGraph.nodes[0];
    if (!root) throw new Error("Expected root node");
    root.x = 360;
    root.y = -80;

    engine.setData({
      nodes: [
        { id: "root", radius: 14 },
        { id: "source", radius: 8 },
        { id: "new-source", radius: 7 },
      ],
      links: [
        { source: "root", target: "source" },
        { source: "source", target: "new-source" },
      ],
    });

    const nextGraph = engine.getGraphData();
    expect(nextGraph.nodes[0]).toBe(root);
    expect(root.x).toBe(360);
    expect(root.y).toBe(-80);
    expect(root.radius).toBe(14);
    expect(root.weight).toBe(1);
    expect(nextGraph.links).toHaveLength(2);
    expect(nextGraph.nodes.map((node) => node.id)).toEqual(["root", "source", "new-source"]);

    engine.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("uses explicit semantic weights when the graph builder supplies them", () => {
    const worker = new FakeWorker();
    const engine = createEngine(worker);

    engine.setData({
      nodes: [
        { id: "hub", weight: 30 },
        { id: "leaf", weight: 0 },
      ],
      links: [{ source: "hub", target: "leaf" }],
    });

    const graph = engine.getGraphData();
    expect(graph.nodes[0]?.weight).toBe(30);
    expect(graph.nodes[0]?.radius).toBeCloseTo(3 * Math.sqrt(31));
    expect(graph.nodes[1]?.weight).toBe(0);
    expect(graph.nodes[1]?.radius).toBe(8);
  });

  it("gives the bundle-compatible weights map precedence over node hints", () => {
    const worker = new FakeWorker();
    const engine = createEngine(worker);

    engine.setData({
      nodes: [
        { id: "hub", weight: 2 },
        { id: "leaf", weight: 20 },
      ],
      links: [{ source: "hub", target: "leaf" }],
      weights: { hub: 18 },
    });

    expect(engine.getGraphData().nodes.map((node) => node.weight)).toEqual([18, 0]);
    expect(worker.messages.at(-1)).toMatchObject({ type: "set-graph", alpha: 0.3 });
    const messageCount = worker.messages.length;

    engine.setData({
      nodes: [
        { id: "hub", weight: 2 },
        { id: "leaf", weight: 20 },
      ],
      links: [{ source: "hub", target: "leaf" }],
      weights: { hub: 7, leaf: 4 },
    });

    expect(engine.getGraphData().nodes.map((node) => node.weight)).toEqual([7, 4]);
    expect(worker.messages).toHaveLength(messageCount + 1);
    expect(worker.messages.at(-1)).toMatchObject({ type: "set-graph", alpha: 0.3 });
  });

  it("seeds a new linked node around positioned neighbors", () => {
    const worker = new FakeWorker();
    const randomValues = [0.5, 0.5];
    const engine = new GraphViewEngine({
      createWorker: () => worker as unknown as Worker,
      random: () => randomValues.shift() ?? 0.5,
    });

    engine.setData({
      nodes: [{ id: "root", x: 100, y: -40 }],
      links: [],
    });
    engine.setData({
      nodes: [{ id: "root" }, { id: "new" }],
      links: [{ source: "root", target: "new" }],
    });

    const newNode = engine.getGraphData().nodes.find((node) => node.id === "new");
    expect(newNode?.x).toBe(100);
    expect(newNode?.y).toBe(-40);
  });

  it("lets later nodes in one update follow earlier newly seeded neighbours", () => {
    const worker = new FakeWorker();
    const randomValues = [0.5, 0.5, 0.5, 0.5];
    const engine = new GraphViewEngine({
      createWorker: () => worker as unknown as Worker,
      random: () => randomValues.shift() ?? 0.5,
    });

    engine.setData({ nodes: [{ id: "root", x: 100, y: -40 }], links: [] });
    engine.setData({
      nodes: [{ id: "root" }, { id: "first" }, { id: "second" }],
      links: [
        { source: "root", target: "first" },
        { source: "first", target: "second" },
      ],
    });

    const graph = engine.getGraphData();
    const first = graph.nodes.find((node) => node.id === "first");
    const second = graph.nodes.find((node) => node.id === "second");
    expect(first?.x).toBe(100);
    expect(first?.y).toBe(-40);
    expect(second?.x).toBe(100);
    expect(second?.y).toBe(-40);
  });

  it("does not reheat physics for render-only data changes", () => {
    const worker = new FakeWorker();
    const engine = createEngine(worker);
    engine.setData({
      nodes: [
        { id: "root", data: { color: "#5069d9", label: "Root" } },
        { id: "source", data: { color: "#159b86", label: "Source" } },
      ],
      links: [{ id: "first", source: "root", target: "source" }],
    });
    const firstGraph = engine.getGraphData();
    const firstLink = firstGraph.links[0];
    expect(worker.messages).toHaveLength(1);

    engine.setData({
      nodes: [
        { id: "root", data: { color: "#ff0000", label: "Renamed root" } },
        { id: "source", data: { color: "#00ff00", label: "Renamed source" } },
      ],
      links: [{ id: "transport-id-changed", source: "root", target: "source" }],
    });

    expect(worker.messages).toHaveLength(1);
    expect(engine.getGraphData().links[0]).toBe(firstLink);
    expect(engine.getGraphData().nodes[0]?.data).toMatchObject({
      color: "#ff0000",
      label: "Renamed root",
    });
  });

  it("restores the initial layout only when explicitly requested", () => {
    const worker = new FakeWorker();
    const engine = createEngine(worker);
    engine.setData({
      nodes: [{ id: "root", x: 10, y: 20 }],
      links: [],
    });

    const node = engine.getGraphData().nodes[0];
    if (!node) throw new Error("Expected root node");
    node.x = 400;
    node.y = 500;

    engine.resetLayout();
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
    expect(worker.messages.at(-1)?.type).toBe("set-graph");

    engine.reheat(0.4);
    expect(worker.messages.at(-1)).toMatchObject({ type: "reheat", alpha: 0.4 });
    expect(worker.messages.at(-1)).toHaveProperty("sequence");
  });

  it("forwards drag and release without forcing a layout reset", () => {
    const worker = new FakeWorker();
    const engine = createEngine(worker);
    engine.setData({
      nodes: [{ id: "root", x: 0, y: 0 }],
      links: [],
    });

    engine.dragNode("root", 80, -30);
    expect(worker.messages.at(-1)).toMatchObject({ type: "drag", id: "root", x: 80, y: -30 });
    expect(worker.messages.at(-1)).toHaveProperty("sequence");
    const graphSequence = requestWithSequence(worker.messages.at(-1)).sequence;
    engine.dragNode("root", 90, -20);
    expect(requestWithSequence(worker.messages.at(-1)).sequence).toBe(graphSequence);
    expect(engine.getGraphData().nodes[0]?.fx).toBe(90);
    expect(engine.getGraphData().nodes[0]?.fy).toBe(-20);

    engine.releaseNode("root");
    expect(worker.messages.at(-1)).toMatchObject({ type: "release", id: "root" });
    expect(worker.messages.at(-1)).toHaveProperty("sequence");
    expect(engine.getGraphData().nodes[0]?.fx).toBeNull();
    expect(engine.getGraphData().nodes[0]?.fy).toBeNull();
  });

  it("ignores stale position buffers", () => {
    const worker = new FakeWorker();
    const engine = createEngine(worker);
    engine.setData({
      nodes: [
        { id: "root", x: 0, y: 0 },
        { id: "source", x: 100, y: 0 },
      ],
      links: [{ source: "root", target: "source" }],
    });

    const emitPositions = (version: number, rootX: number) => {
      const positions = new Float32Array([rootX, 20, 100, 40]);
      worker.emit({
        type: "positions",
        version,
        sequence: version,
        buffer: positions.buffer,
        ids: ["root", "source"],
        count: 2,
      });
    };

    emitPositions(1, 120);
    expect(engine.getGraphData().nodes[0]?.x).toBe(120);
    emitPositions(0, 900);
    expect(engine.getGraphData().nodes[0]?.x).toBe(120);
  });

  it("consumes a shared position frame only after its trailing publish slot changes", () => {
    const worker = new FakeWorker();
    const engine = createEngine(worker);
    engine.setData({
      nodes: [
        { id: "root", x: 0, y: 0 },
        { id: "source", x: 100, y: 0 },
      ],
      links: [{ source: "root", target: "source" }],
    });

    const graphRequest = worker.messages.at(-1);
    if (graphRequest?.type !== "set-graph") {
      throw new Error("Expected a graph request");
    }
    const buffer = new SharedArrayBuffer(2 * 2 * Float32Array.BYTES_PER_ELEMENT + 4);
    const positions = new Float32Array(buffer, 0, 4);
    const versionSlot = new Uint32Array(buffer, buffer.byteLength - 4, 1);

    positions.set([20, 30, 100, 110]);
    versionSlot[0] = 1;
    worker.emit({
      type: "positions",
      version: graphRequest.version,
      sequence: graphRequest.sequence,
      buffer,
      ids: ["root", "source"],
      count: 2,
      positionVersion: 0,
    });
    expect(engine.getGraphData().nodes[0]?.x).toBe(20);

    positions[0] = 900;
    worker.emit({
      type: "positions",
      version: graphRequest.version,
      sequence: graphRequest.sequence,
      buffer,
      ids: ["root", "source"],
      count: 2,
      positionVersion: 1,
    });
    expect(engine.getGraphData().nodes[0]?.x).toBe(20);

    positions[0] = 40;
    versionSlot[0] = 2;
    worker.emit({
      type: "positions",
      version: graphRequest.version,
      sequence: graphRequest.sequence,
      buffer,
      ids: ["root", "source"],
      count: 2,
      positionVersion: 1,
    });
    expect(engine.getGraphData().nodes[0]?.x).toBe(40);
  });
});
