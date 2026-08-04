import { describe, expect, it } from "vitest";
import {
  cloneGraphViewOptions,
  DEFAULT_GRAPH_VIEW_DISPLAY,
  DEFAULT_GRAPH_VIEW_FILTERS,
  DEFAULT_GRAPH_VIEW_FORCE_OPTIONS,
  DEFAULT_GRAPH_VIEW_OPTIONS,
  forceControl,
  graphViewOptionsFromSnapshot,
  graphViewOptionsSnapshot,
  graphViewQueries,
  hasFilteringQuery,
  inverseForceControl,
  normalizeLocalJumps,
  repelControl,
} from "./options";

describe("recovered Graph View options", () => {
  it("keeps the bundle defaults separate by settings section", () => {
    expect(DEFAULT_GRAPH_VIEW_FILTERS).toMatchObject({
      showAttachments: false,
      hideUnresolved: false,
      showOrphans: true,
      showTags: false,
      localJumps: 1,
      localForelinks: true,
      localBacklinks: true,
      localInterlinks: false,
    });
    expect(DEFAULT_GRAPH_VIEW_DISPLAY).toEqual({
      showArrow: false,
      textFadeMultiplier: 0,
      nodeSizeMultiplier: 1,
      lineSizeMultiplier: 1,
    });
    expect(DEFAULT_GRAPH_VIEW_FORCE_OPTIONS).toMatchObject({
      repelStrength: 10,
      linkDistance: 250,
    });
  });

  it("round-trips the non-linear force slider mapping", () => {
    for (const value of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
      expect(inverseForceControl(forceControl(value))).toBeCloseTo(value, 10);
    }
    expect(DEFAULT_GRAPH_VIEW_FORCE_OPTIONS.centerStrength).toBeCloseTo(0.518, 2);
    expect(forceControl(DEFAULT_GRAPH_VIEW_FORCE_OPTIONS.centerStrength)).toBeCloseTo(0.1, 10);
    expect(forceControl(DEFAULT_GRAPH_VIEW_FORCE_OPTIONS.linkStrength)).toBeCloseTo(1, 10);
  });

  it("uses the cubic repel slider mapping", () => {
    expect(repelControl(0)).toBe(0);
    expect(repelControl(10)).toBe(1000);
    expect(repelControl(20)).toBe(8000);
  });

  it("keeps local graph jumps inside the exposed slider range", () => {
    expect(normalizeLocalJumps(-4)).toBe(1);
    expect(normalizeLocalJumps(2.6)).toBe(3);
    expect(normalizeLocalJumps(99)).toBe(5);
  });

  it("treats uncolored search as filtering and color groups as decoration", () => {
    const queries = graphViewQueries("folder:retrieval", [
      { query: "#important", color: { a: 1, rgb: 0xff00ff } },
    ]);

    expect(queries).toHaveLength(2);
    expect(queries[0]?.color).toBeNull();
    expect(queries[1]?.color?.rgb).toBe(0xff00ff);
    expect(hasFilteringQuery(queries)).toBe(true);
    expect(
      hasFilteringQuery(
        graphViewQueries("", [{ query: "#important", color: { a: 1, rgb: 0xff00ff } }]),
      ),
    ).toBe(false);
  });

  it("clones settings without sharing nested mutable state", () => {
    const options = cloneGraphViewOptions({
      filters: { localJumps: 9 },
      colorGroups: [{ query: "#a", color: { a: 1, rgb: 12 } }],
    });
    const firstGroup = options.colorGroups[0];
    if (!firstGroup) throw new Error("expected a cloned color group");
    firstGroup.color.rgb = 44;

    expect(options.filters.localJumps).toBe(5);
    expect(DEFAULT_GRAPH_VIEW_FILTERS.localJumps).toBe(1);
    expect(DEFAULT_GRAPH_VIEW_OPTIONS.colorGroups).toEqual([]);
  });

  it("round-trips the controller's flat option snapshot", () => {
    const options = cloneGraphViewOptions({
      search: "folder:retrieval",
      filters: { showAttachments: true, localFile: "index.md", localJumps: 3 },
      display: { showArrow: true, textFadeMultiplier: -1.2 },
      forces: { repelStrength: 7, linkDistance: 399 },
      colorGroups: [{ query: "#important", color: { a: 1, rgb: 0xff00ff } }],
    });
    const snapshot = graphViewOptionsSnapshot(options, {
      scale: 0.5,
      close: true,
      collapsed: { "collapse-display": false },
    });

    expect(snapshot).toMatchObject({
      search: "folder:retrieval",
      showAttachments: true,
      localFile: "index.md",
      localJumps: 3,
      showArrow: true,
      textFadeMultiplier: -1.2,
      repelStrength: 7,
      linkDistance: 399,
      scale: 0.5,
      close: true,
      "collapse-filter": true,
      "collapse-display": false,
    });

    const restored = graphViewOptionsFromSnapshot(snapshot);
    expect(restored).toEqual(options);
  });

  it("uses bundle defaults when loading a partial snapshot", () => {
    const restored = graphViewOptionsFromSnapshot({ showArrow: true });
    expect(restored.search).toBe("");
    expect(restored.display.showArrow).toBe(true);
    expect(restored.filters.showOrphans).toBe(true);
    expect(restored.forces.repelStrength).toBe(10);
  });
});
