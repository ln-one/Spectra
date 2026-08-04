import { describe, expect, it } from "vitest";
import {
  createGraphViewControllerState,
  getGraphViewControllerOptions,
  patchGraphViewControllerState,
  resetGraphViewControllerState,
  setGraphViewControllerClosed,
  setGraphViewControllerOptions,
  setGraphViewControllerScale,
} from "./controller";

describe("graph view controller boundary", () => {
  it("round-trips the flat persisted controller shape", () => {
    const state = createGraphViewControllerState(
      { search: "architecture", filters: { showTags: true } },
      { scale: 0.8, close: true, collapsed: { "collapse-filter": false } },
    );
    const snapshot = getGraphViewControllerOptions(state);

    expect(snapshot.search).toBe("architecture");
    expect(snapshot.showTags).toBe(true);
    expect(snapshot.scale).toBe(0.8);
    expect(snapshot.close).toBe(true);
    expect(snapshot["collapse-filter"]).toBe(false);
  });

  it("preserves omitted values when applying a partial persisted snapshot", () => {
    const state = createGraphViewControllerState(
      { search: "keep", filters: { showTags: true } },
      { scale: 0.6, close: true },
    );
    const next = setGraphViewControllerOptions(state, { showTags: false });
    const snapshot = getGraphViewControllerOptions(next);

    expect(snapshot.search).toBe("keep");
    expect(snapshot.showTags).toBe(false);
    expect(snapshot.scale).toBe(0.6);
    expect(snapshot.close).toBe(true);
  });

  it("keeps the recovered truthy-only scale and close semantics", () => {
    const state = createGraphViewControllerState({}, { scale: 0.7, close: true });
    expect(
      getGraphViewControllerOptions(setGraphViewControllerOptions(state, { scale: 0 })),
    ).toMatchObject({
      scale: 0.7,
      close: true,
    });
    expect(
      getGraphViewControllerOptions(setGraphViewControllerOptions(state, { close: false })),
    ).toMatchObject({
      scale: 0.7,
      close: true,
    });
  });

  it("offers explicit host actions for close and scale", () => {
    const state = createGraphViewControllerState({}, { scale: 1, close: false });
    const next = setGraphViewControllerScale(setGraphViewControllerClosed(state, true), 1.25);
    expect(getGraphViewControllerOptions(next)).toMatchObject({ scale: 1.25, close: true });
  });

  it("patches grouped options without replacing unrelated sections", () => {
    const state = createGraphViewControllerState({
      search: "source",
      filters: { showTags: true },
      display: { showArrow: true },
    });
    const next = patchGraphViewControllerState(state, { forces: { linkDistance: 399 } });
    expect(next.options.filters.showTags).toBe(true);
    expect(next.options.display.showArrow).toBe(true);
    expect(next.options.forces.linkDistance).toBe(399);
  });

  it("resets to the recovered defaults", () => {
    const snapshot = getGraphViewControllerOptions(resetGraphViewControllerState());
    expect(snapshot.search).toBe("");
    expect(snapshot.showOrphans).toBe(true);
    expect(snapshot.showArrow).toBe(false);
    expect(snapshot["collapse-forces"]).toBe(true);
  });
});
