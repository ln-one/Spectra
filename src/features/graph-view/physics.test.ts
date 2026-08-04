import { describe, expect, it } from "vitest";
import { type GraphViewPhysicsNode, graphViewPhysicsStep } from "./physics";

function options(overrides: Partial<Parameters<typeof graphViewPhysicsStep>[2]> = {}) {
  return {
    nodeCount: 2,
    linkCount: 0,
    alpha: 1,
    centerStrength: 0,
    linkStrength: 0,
    linkDistance: 250,
    repelStrength: 0,
    simulationDamping: 0.9,
    completionDamping: 0.6,
    ...overrides,
  };
}

function cloneNodes(nodes: readonly GraphViewPhysicsNode[]): GraphViewPhysicsNode[] {
  return nodes.map((node) => ({ ...node }));
}

describe("graphViewPhysicsStep", () => {
  it("keeps deterministic output for the same state", () => {
    const initial = [
      { x: -30, y: 4, vx: 0, vy: 0 },
      { x: 70, y: -3, vx: 0, vy: 0 },
      { x: 12, y: 52, vx: 0, vy: 0 },
    ];
    const first = cloneNodes(initial);
    const second = cloneNodes(initial);
    const config = options({
      nodeCount: 3,
      repelStrength: 180,
      collisionRadius: 8,
      collisionStrength: 0.5,
    });

    graphViewPhysicsStep(first, [], config);
    graphViewPhysicsStep(second, [], config);

    expect(second).toEqual(first);
  });

  it("moves linked nodes toward the recovered link distance", () => {
    const nodes = [
      { x: 0, y: 0, vx: 0, vy: 0 },
      { x: 100, y: 0, vx: 0, vy: 0 },
    ];

    graphViewPhysicsStep(
      nodes,
      [{ source: 0, target: 1 }],
      options({ linkStrength: 1, repelStrength: 0, collisionRadius: 0 }),
    );

    expect(nodes[0]?.x).toBeLessThan(0);
    expect(nodes[1]?.x).toBeGreaterThan(100);
  });

  it("treats repelStrength as a magnitude and separates nodes", () => {
    const nodes = [
      { x: 0, y: 0, vx: 0, vy: 0 },
      { x: 100, y: 0, vx: 0, vy: 0 },
    ];

    graphViewPhysicsStep(nodes, [], options({ repelStrength: 1000, collisionRadius: 0 }));

    expect(nodes[0]?.x).toBeLessThan(0);
    expect(nodes[1]?.x).toBeGreaterThan(100);
  });

  it("separates colliding predicted positions", () => {
    const nodes = [
      { x: 0, y: 0, vx: 0, vy: 0 },
      { x: 10, y: 0, vx: 0, vy: 0 },
    ];

    graphViewPhysicsStep(
      nodes,
      [],
      options({ repelStrength: 0, collisionRadius: 60, collisionStrength: 1 }),
    );

    expect((nodes[1]?.x ?? 0) - (nodes[0]?.x ?? 0)).toBeGreaterThan(10);
  });

  it("keeps fixed coordinates and clears fixed-axis velocity", () => {
    const nodes = [{ x: 20, y: 30, vx: 12, vy: -4, fx: 5, fy: null }];

    graphViewPhysicsStep(
      nodes,
      [],
      options({ nodeCount: 1, repelStrength: 0, collisionRadius: 0 }),
    );

    expect(nodes[0]).toMatchObject({ x: 5, vx: 0, y: 27.6, vy: -2.4 });
  });
});
