import { describe, expect, it } from "vitest";
import {
  graphViewWheelDelta,
  graphViewWheelZoom,
  graphViewZoomTo,
  updateGraphViewZoom,
} from "./camera";

describe("graph view camera mathematics", () => {
  it("normalizes the exact wheel delta multipliers", () => {
    expect(graphViewWheelDelta(1, 0)).toBe(1);
    expect(graphViewWheelDelta(1, 1)).toBe(40);
    expect(graphViewWheelDelta(1, 2)).toBe(800);
  });

  it("uses the pointer anchor for zoom in and the center sentinel for zoom out", () => {
    const transform = { panX: 100, panY: 80, scale: 1 };
    expect(
      graphViewWheelZoom(transform, {
        deltaY: -120,
        offsetX: 40,
        offsetY: 24,
        devicePixelRatio: 2,
      }),
    ).toEqual({
      targetScale: 1.5,
      zoomCenter: { x: 80, y: 48 },
    });
    expect(
      graphViewWheelZoom(transform, {
        deltaY: 120,
        offsetX: 40,
        offsetY: 24,
        devicePixelRatio: 2,
      }),
    ).toEqual({
      targetScale: 1 / 1.5,
      zoomCenter: { x: 0, y: 0 },
    });
  });

  it("accumulates small wheel events on the pending target scale", () => {
    const transform = { panX: 0, panY: 0, scale: 1 };
    const first = graphViewWheelZoom(transform, {
      deltaY: -8,
      offsetX: 40,
      offsetY: 24,
      devicePixelRatio: 1,
    });
    const second = graphViewWheelZoom(
      transform,
      {
        deltaY: -8,
        offsetX: 40,
        offsetY: 24,
        devicePixelRatio: 1,
      },
      first.targetScale,
    );

    expect(second.targetScale).toBeGreaterThan(first.targetScale);
    expect(second.targetScale).toBeCloseTo(1.5 ** (16 / 120), 8);
  });

  it("keeps the world point under the anchor fixed while smoothing", () => {
    const result = updateGraphViewZoom(
      { panX: 100, panY: 80, scale: 1 },
      1.5,
      { x: 80, y: 48 },
      { width: 400, height: 200 },
      2,
    );
    expect(result.changed).toBe(true);
    expect(result.transform.scale).toBeCloseTo(1.425, 8);
    expect(result.transform.panX).toBeCloseTo(108.5, 8);
    expect(result.transform.panY).toBeCloseTo(93.6, 8);
  });

  it("clamps the target and uses the viewport center for the zero anchor", () => {
    expect(graphViewZoomTo(100)).toEqual({
      targetScale: 100,
      zoomCenter: { x: 0, y: 0 },
    });
    const result = updateGraphViewZoom(
      { panX: 0, panY: 0, scale: 1 },
      100,
      { x: 0, y: 0 },
      { width: 200, height: 100 },
      1,
      1,
    );
    expect(result.targetScale).toBe(8);
    expect(result.transform).toEqual({ panX: -700, panY: -350, scale: 8 });
  });

  it("does not move when within the recovered one-percent deadband", () => {
    const result = updateGraphViewZoom(
      { panX: 10, panY: 20, scale: 1 },
      1.005,
      { x: 0, y: 0 },
      { width: 200, height: 100 },
      1,
    );
    expect(result.changed).toBe(false);
    expect(result.transform).toEqual({ panX: 10, panY: 20, scale: 1 });
  });
});
