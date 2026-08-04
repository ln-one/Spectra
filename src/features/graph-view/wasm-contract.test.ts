import { describe, expect, it } from "vitest";
import {
  GRAPH_VIEW_WASM_COMPLETION_VELOCITY_DECAY,
  GRAPH_VIEW_WASM_KERNEL_CONTRACT,
  GRAPH_VIEW_WASM_LINK_INT_STRIDE,
  GRAPH_VIEW_WASM_NODE_FLOAT_STRIDE,
  GRAPH_VIEW_WASM_SIMULATION_DAMPING,
  graphViewWasmBufferBytes,
  graphViewWasmLinkIntOffset,
  graphViewWasmNodeFloatOffset,
  graphViewWasmSimulationArguments,
} from "./wasm-contract";

describe("graph view physics ABI", () => {
  it("keeps the recovered node and link strides", () => {
    expect(GRAPH_VIEW_WASM_NODE_FLOAT_STRIDE).toBe(5);
    expect(GRAPH_VIEW_WASM_LINK_INT_STRIDE).toBe(3);
    expect(graphViewWasmNodeFloatOffset(2, "x")).toBe(10);
    expect(graphViewWasmNodeFloatOffset(2, "vy")).toBe(13);
    expect(graphViewWasmLinkIntOffset(4, 3, 1)).toBe(30);
  });

  it("matches the recovered allocation formula", () => {
    expect(graphViewWasmBufferBytes(2, 1)).toBe(1_140);
    expect(graphViewWasmBufferBytes(-1, -4)).toBe(1_024);
  });

  it("records the exact exported function signatures", () => {
    expect(GRAPH_VIEW_WASM_KERNEL_CONTRACT.exports.init.parameters).toEqual(["i32", "i32", "i32"]);
    expect(GRAPH_VIEW_WASM_KERNEL_CONTRACT.exports.simulate.parameters).toEqual([
      "i32",
      "i32",
      "i32",
      "f32",
      "f32",
      "f32",
      "f32",
      "f32",
      "f32",
      "f32",
    ]);
    expect(GRAPH_VIEW_WASM_KERNEL_CONTRACT.exports.complete.parameters).toEqual([
      "i32",
      "i32",
      "f32",
    ]);
  });

  it("keeps the recovered simulate and complete constants explicit", () => {
    expect(graphViewWasmSimulationArguments(8, 12, 0.4, 0.1, 1, 250, 1000)).toEqual({
      nodeCount: 8,
      linkCount: 12,
      alpha: 0.4,
      centerStrength: 0.1,
      linkStrength: 1,
      linkDistance: 250,
      repelStrength: 1000,
      simulationDamping: GRAPH_VIEW_WASM_SIMULATION_DAMPING,
      completionDamping: GRAPH_VIEW_WASM_COMPLETION_VELOCITY_DECAY,
    });
  });
});
