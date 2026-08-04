import { describe, expect, it } from "vitest";
import {
  GRAPH_VIEW_BASE_ALPHA,
  GRAPH_VIEW_LAZY_NODE_BATCH_SIZE,
  graphViewArrowAlpha,
  graphViewFade,
  graphViewLabelLayout,
  graphViewLazyNodeIds,
  graphViewLinkGeometry,
  graphViewLinkTargetAlpha,
  graphViewNodeScale,
  graphViewNodeSize,
  graphViewNodeTargetAlpha,
  graphViewTextAlpha,
  shouldRenderDirectedLink,
} from "./renderer-behavior";

describe("recovered renderer behavior", () => {
  it("uses the logarithmic text fade threshold", () => {
    expect(graphViewTextAlpha(1, 0)).toBe(1);
    expect(graphViewTextAlpha(0.5, 0)).toBeCloseTo(0.0, 10);
    expect(graphViewTextAlpha(2, 0)).toBe(1);
    expect(graphViewTextAlpha(1, 0.4)).toBeCloseTo(0.6, 10);
  });

  it("keeps unrelated nodes and links visible but dimmed", () => {
    expect(graphViewNodeTargetAlpha(true, false, false)).toBe(GRAPH_VIEW_BASE_ALPHA);
    expect(graphViewNodeTargetAlpha(true, false, true)).toBe(1);
    expect(graphViewLinkTargetAlpha(true, false)).toBe(GRAPH_VIEW_BASE_ALPHA);
    expect(graphViewLinkTargetAlpha(true, true)).toBe(1);
  });

  it("reveals arrows only after the readable zoom threshold", () => {
    expect(graphViewArrowAlpha(1, 0.3)).toBe(0);
    expect(graphViewArrowAlpha(1, 0.8)).toBe(1);
    expect(graphViewArrowAlpha(0.2, 0.8, 0.5)).toBeCloseTo(0.1, 10);
  });

  it("draws one direction for a reverse pair", () => {
    expect(shouldRenderDirectedLink("a", "b", true)).toBe(false);
    expect(shouldRenderDirectedLink("b", "a", true)).toBe(true);
    expect(shouldRenderDirectedLink("a", "b", false)).toBe(true);
  });

  it("uses the same ten-percent fade interpolation as Pixi", () => {
    expect(graphViewFade(0, 1, false)).toBeCloseTo(0.1, 10);
    expect(graphViewFade(0.1, 1, false)).toBeCloseTo(0.19, 10);
    expect(graphViewFade(0.1, 1, true)).toBe(1);
  });

  it("uses the bundle node-size curve and counter-scale", () => {
    expect(graphViewNodeSize(0)).toBe(8);
    expect(graphViewNodeSize(30)).toBeCloseTo(3 * Math.sqrt(31), 10);
    expect(graphViewNodeSize(10_000)).toBe(30);
    expect(graphViewNodeSize(30, 2)).toBeCloseTo(6 * Math.sqrt(31), 10);
    expect(graphViewNodeScale(4)).toBe(0.5);
  });

  it("keeps focused labels readable and moves them by the recovered offset", () => {
    const normal = graphViewLabelLayout({
      x: 10,
      y: 20,
      size: 12,
      scale: 0.5,
      nodeScale: 2,
      moveText: 0,
      focused: false,
      textAlpha: 0.5,
      fadeAlpha: 0.8,
      textColorAlpha: 0.75,
    });
    expect(normal).toMatchObject({
      x: 10,
      y: 54,
      scale: 2,
      targetMoveText: 0,
      visible: true,
    });
    expect(normal.alpha).toBeCloseTo(0.3, 10);

    const focused = graphViewLabelLayout({
      x: 10,
      y: 20,
      size: 12,
      scale: 0.5,
      nodeScale: 2,
      moveText: 4,
      focused: true,
      textAlpha: 0,
      fadeAlpha: 0,
      textColorAlpha: 0.75,
    });
    expect(focused).toMatchObject({
      y: 62,
      scale: 2,
      alpha: 0.75,
      targetMoveText: 15,
      visible: true,
    });

    expect(
      graphViewLabelLayout({
        x: 0,
        y: 0,
        size: 8,
        scale: 2,
        nodeScale: 0.7,
        moveText: 0,
        focused: false,
        textAlpha: 1,
        fadeAlpha: 1,
        textColorAlpha: 0.8,
      }).alpha,
    ).toBeCloseTo(0.8, 10);
  });

  it("clips links at node radii and keeps arrow geometry separate", () => {
    const geometry = graphViewLinkGeometry({
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 0,
      sourceRadius: 10,
      targetRadius: 20,
      scale: 2,
      lineSizeMultiplier: 4,
    });
    expect(geometry).toEqual({
      distance: 100,
      lineThickness: 2,
      line: { x: 10, y: -1, rotation: 0, width: 70, height: 2 },
      arrow: {
        x: 79,
        y: 0,
        rotation: 0,
        scale: 2,
        visibleAtDistance: true,
      },
    });
    expect(
      graphViewLinkGeometry({
        sourceX: 0,
        sourceY: 0,
        targetX: 0.1,
        targetY: 0,
        sourceRadius: 1,
        targetRadius: 1,
        scale: 1,
        lineSizeMultiplier: 1,
      })?.arrow.visibleAtDistance,
    ).toBe(false);
  });

  it("allocates the nearest fifty unseen nodes in stable order", () => {
    const nodes = Array.from({ length: GRAPH_VIEW_LAZY_NODE_BATCH_SIZE + 2 }, (_, index) => ({
      id: `node-${index}`,
      x: index,
      y: 0,
    }));
    const rendered = new Set(["node-0"]);
    const selected = graphViewLazyNodeIds(nodes, rendered, 0, 0);
    expect(selected).toHaveLength(GRAPH_VIEW_LAZY_NODE_BATCH_SIZE);
    expect(selected[0]).toBe("node-1");
    expect(selected).not.toContain("node-0");
    expect(graphViewLazyNodeIds(nodes, rendered, 0, 0, 2)).toEqual(["node-1", "node-2"]);
  });
});
