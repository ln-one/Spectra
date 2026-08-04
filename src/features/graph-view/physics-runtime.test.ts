import { describe, expect, it } from "vitest";
import { DEFAULT_GRAPH_VIEW_FORCES } from "./forces";
import { GraphViewPhysicsRuntime } from "./physics-runtime";

function createRuntime(overrides: Partial<typeof DEFAULT_GRAPH_VIEW_FORCES> = {}) {
  return new GraphViewPhysicsRuntime({ ...DEFAULT_GRAPH_VIEW_FORCES, ...overrides });
}

describe("GraphViewPhysicsRuntime", () => {
  it("keeps graph objects stable while resolving id links once per graph update", () => {
    const runtime = createRuntime({
      centerStrength: 0,
      repelStrength: 0,
      collisionRadius: 0,
    });
    const root = { id: "root", x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null };
    const leaf = { id: "leaf", x: 100, y: 0, vx: 0, vy: 0, fx: null, fy: null };

    runtime.setGraph([root, leaf], [{ source: "root", target: "leaf" }], 1, true);
    const before = runtime.getState();
    runtime.tick();

    expect(root.x).not.toBe(0);
    expect(leaf.x).not.toBe(100);
    expect(runtime.getState().alpha).toBeLessThan(before.alpha);

    runtime.setGraph([root, leaf], [{ source: "root", target: "leaf" }], 0.3);
    expect(runtime.getState().alpha).toBeGreaterThan(0.3);
  });

  it("holds a dragged node and releases it without resetting momentum", () => {
    const runtime = createRuntime();
    const root = { id: "root", x: 0, y: 0, vx: 4, vy: -2, fx: null, fy: null };
    const leaf = { id: "leaf", x: 100, y: 0, vx: 0, vy: 0, fx: null, fy: null };
    runtime.setGraph([root, leaf], [{ source: "root", target: "leaf" }], 1, true);

    expect(runtime.drag("root", 50, 60)).toBe(true);
    runtime.tick();
    expect(root).toMatchObject({ x: 50, y: 60, fx: 50, fy: 60, vx: 0, vy: 0 });

    expect(runtime.release("root")).toBe(true);
    expect(root.fx).toBeNull();
    expect(root.fy).toBeNull();
    expect(runtime.getState().alphaTarget).toBe(0);
  });

  it("uses the recovered minimum degree link normalization", () => {
    const runtime = createRuntime({
      centerStrength: 0,
      repelStrength: 0,
      collisionRadius: 0,
    });
    const nodes = [
      { id: "root", x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null },
      // Keep both links outside the primary WASM collide diameter.  This
      // isolates the recovered link normalization from collision handling.
      { id: "near", x: 500, y: 0, vx: 0, vy: 0, fx: null, fy: null },
      { id: "far", x: 900, y: 0, vx: 0, vy: 0, fx: null, fy: null },
    ];
    runtime.setGraph(
      nodes,
      [
        { source: "root", target: "near" },
        { source: "root", target: "far" },
      ],
      1,
      true,
    );

    runtime.tick();

    expect(nodes[0]?.x).toBeCloseTo(152.5572, 3);
    expect(nodes[1]?.x).toBeCloseTo(409.7031, 3);
    expect(nodes[2]?.x).toBeCloseTo(677.7535, 3);
  });
});
