import { describe, expect, it } from "vitest";
import {
  advanceGraphViewLegacyAlpha,
  applyGraphViewLegacyForceNode,
  applyGraphViewLegacyForcePatch,
  type GraphViewLegacyWorkerNode,
  graphViewLegacySharedFrameBytes,
  reconcileGraphViewLegacyNodeTable,
  resolveGraphViewLegacyLinks,
} from "./worker-protocol";

function node(id: string, x = 0): GraphViewLegacyWorkerNode {
  return { id, x, y: 0, vx: x, vy: 0, fx: null, fy: null, index: 0 };
}

describe("graph view worker protocol", () => {
  it("reuses the original node identity and old-table order", () => {
    const retained = node("retained", 3);
    const previous = new Map([
      ["retained", retained],
      ["removed", node("removed")],
    ]);
    const update = reconcileGraphViewLegacyNodeTable(previous, {
      retained: [9, 4],
      added: [2, 1],
    });

    expect(update.order).toEqual(["retained", "added"]);
    expect(update.nodesById.get("retained")).toBe(retained);
    expect(retained.x).toBe(9);
    expect(retained.vx).toBe(3);
    expect(update.nodesById.get("removed")).toBeUndefined();
    expect(update.nodesById.get("added")?.index).toBe(1);
  });

  it("does not overwrite coordinates for a null node tuple", () => {
    const retained = node("retained", 3);
    const update = reconcileGraphViewLegacyNodeTable(new Map([["retained", retained]]), {
      retained: null,
    });

    expect(update.nodesById.get("retained")?.x).toBe(3);
  });

  it("filters links whose endpoints are absent", () => {
    const source = node("source");
    const target = node("target");
    const links = resolveGraphViewLegacyLinks(
      [
        ["source", "target"],
        ["source", "missing"],
      ],
      new Map([
        [source.id, source],
        [target.id, target],
      ]),
    );

    expect(links).toHaveLength(1);
    expect(links[0]?.source).toBe(source);
    expect(links[0]?.target).toBe(target);
  });

  it("preserves force fields and negates the public repel value", () => {
    const previous = {
      centerStrength: 0.1,
      linkStrength: 1,
      linkDistance: 250,
      repelStrength: -1000,
    };
    expect(applyGraphViewLegacyForcePatch(previous, { linkDistance: 399 })).toEqual({
      ...previous,
      linkDistance: 399,
    });
    expect(applyGraphViewLegacyForcePatch(previous, { repelStrength: 0.4 }).repelStrength).toBe(-1);
    expect(applyGraphViewLegacyForcePatch(previous, { repelStrength: 10 }).repelStrength).toBe(-10);
  });

  it("raises alpha, replaces alphaTarget, and schedules for run:false", () => {
    expect(
      advanceGraphViewLegacyAlpha(
        { alpha: 0.2, alphaTarget: 0, shouldSchedule: false },
        { alpha: 0.1, alphaTarget: 0.3, run: false },
      ),
    ).toEqual({ alpha: 0.2, alphaTarget: 0.3, shouldSchedule: true });
    expect(
      advanceGraphViewLegacyAlpha(
        { alpha: 0.2, alphaTarget: 0, shouldSchedule: false },
        { alpha: 0.8 },
      ).alpha,
    ).toBe(0.8);
  });

  it("writes forceNode coordinates without changing the other velocity state", () => {
    const target = node("target", 2);
    target.vy = 7;
    applyGraphViewLegacyForceNode(target, { id: "target", x: 8, y: null });
    expect(target.fx).toBe(8);
    expect(target.fy).toBeNull();
    expect(target.vy).toBe(7);
  });

  it("uses two float coordinates plus a four-byte shared version slot", () => {
    expect(graphViewLegacySharedFrameBytes(10)).toBe(84);
    expect(graphViewLegacySharedFrameBytes(-1)).toBe(4);
  });
});
