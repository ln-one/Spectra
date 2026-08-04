import { describe, expect, it } from "vitest";
import {
  GRAPH_VIEW_CLICK_DISTANCE_SQUARED,
  graphViewDragThresholdExceeded,
  shouldInvokeGraphViewContextAction,
  shouldSelectGraphViewNode,
} from "./pointer-behavior";

describe("recovered graph pointer decisions", () => {
  it("starts dragging only after a strict five-pixel boundary", () => {
    expect(GRAPH_VIEW_CLICK_DISTANCE_SQUARED).toBe(25);
    expect(graphViewDragThresholdExceeded(0, 0, 3, 4)).toBe(false);
    expect(graphViewDragThresholdExceeded(0, 0, 0, 5.01)).toBe(true);
  });

  it("selects with left/middle/touch releases but not modified or dragged clicks", () => {
    expect(
      shouldSelectGraphViewNode({
        pointerType: "mouse",
        button: 0,
        modifier: false,
        dragging: false,
        cancelled: false,
      }),
    ).toBe(true);
    expect(
      shouldSelectGraphViewNode({
        pointerType: "mouse",
        button: 1,
        modifier: false,
        dragging: false,
        cancelled: false,
      }),
    ).toBe(true);
    expect(
      shouldSelectGraphViewNode({
        pointerType: "mouse",
        button: 2,
        modifier: false,
        dragging: false,
        cancelled: false,
      }),
    ).toBe(false);
    expect(
      shouldSelectGraphViewNode({
        pointerType: "touch",
        button: 0,
        modifier: false,
        dragging: false,
        cancelled: false,
      }),
    ).toBe(true);
    expect(
      shouldSelectGraphViewNode({
        pointerType: "mouse",
        button: 0,
        modifier: true,
        dragging: false,
        cancelled: false,
      }),
    ).toBe(false);
    expect(
      shouldSelectGraphViewNode({
        pointerType: "mouse",
        button: 0,
        modifier: false,
        dragging: true,
        cancelled: false,
      }),
    ).toBe(false);
  });

  it("routes right click and Mac control-click to the context action", () => {
    expect(
      shouldInvokeGraphViewContextAction({
        pointerType: "mouse",
        button: 2,
        modifier: false,
        dragging: false,
        cancelled: false,
      }),
    ).toBe(true);
    expect(
      shouldInvokeGraphViewContextAction({
        pointerType: "mouse",
        button: 0,
        modifier: true,
        dragging: false,
        cancelled: false,
      }),
    ).toBe(true);
    expect(
      shouldInvokeGraphViewContextAction({
        pointerType: "mouse",
        button: 2,
        modifier: false,
        dragging: true,
        cancelled: false,
      }),
    ).toBe(false);
  });
});
