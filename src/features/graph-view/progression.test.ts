import { describe, expect, it } from "vitest";
import {
  advanceGraphViewProgression,
  beginGraphViewProgression,
  graphViewProgressionSpeed,
  resolveGraphViewProgressionRender,
} from "./progression";

describe("graph view progression controller", () => {
  it("uses the recovered square-root speed curve and clamps it", () => {
    expect(graphViewProgressionSpeed(0)).toBe(5);
    expect(graphViewProgressionSpeed(100)).toBe(5);
    expect(graphViewProgressionSpeed(40000)).toBe(100);
    expect(graphViewProgressionSpeed(400)).toBe(10);
  });

  it("starts at progression one and records a stable clock origin", () => {
    expect(beginGraphViewProgression(400, 1200)).toEqual({
      progression: 1,
      progressionSpeed: 10,
      startedAtMs: 1200,
    });
  });

  it("waits when the elapsed clock has not crossed a new progression", () => {
    const state = beginGraphViewProgression(400, 1200);
    expect(advanceGraphViewProgression(state, 1, 1299)).toEqual({
      kind: "wait",
      progression: 1,
    });
  });

  it("renders the time-derived progression after a macrotask yield", () => {
    const state = beginGraphViewProgression(400, 1200);
    expect(advanceGraphViewProgression(state, 1, 1400)).toEqual({
      kind: "render",
      progression: 3,
    });
  });

  it("stops when a render or reset changed progression while yielding", () => {
    const state = beginGraphViewProgression(400, 1200);
    expect(advanceGraphViewProgression(state, 2, 1400)).toEqual({
      kind: "stop",
      progression: 1,
    });
  });

  it("preserves the assigned progression when render returns falsy", () => {
    expect(resolveGraphViewProgressionRender(12, 0)).toEqual({
      continue: false,
      progression: 12,
    });
    expect(resolveGraphViewProgressionRender(12, 87)).toEqual({
      continue: true,
      progression: 12,
    });
  });
});
