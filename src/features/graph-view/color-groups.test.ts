import { describe, expect, it } from "vitest";
import {
  colorGroupDropIndex,
  createGraphViewColorGroup,
  exceededColorGroupDragThreshold,
  graphViewHslToRgb,
  reorderColorGroups,
} from "./color-groups";
import type { GraphViewColorGroup } from "./options";

const groups: GraphViewColorGroup[] = [
  { query: "alpha", color: { a: 1, rgb: 0xff0000 } },
  { query: "beta", color: { a: 1, rgb: 0x00ff00 } },
  { query: "gamma", color: { a: 1, rgb: 0x0000ff } },
];

describe("recovered color group interaction", () => {
  it("uses the same 5px squared drag threshold as the graph controls", () => {
    expect(exceededColorGroupDragThreshold(10, 10, 14, 13)).toBe(false);
    expect(exceededColorGroupDragThreshold(10, 10, 16, 10)).toBe(true);
  });

  it("drops before the first midpoint and after the last midpoint", () => {
    const rows = [
      { top: 0, height: 40 },
      { top: 40, height: 40 },
      { top: 80, height: 40 },
    ];
    expect(colorGroupDropIndex(rows, 19)).toBe(0);
    expect(colorGroupDropIndex(rows, 20)).toBe(1);
    expect(colorGroupDropIndex(rows, 119)).toBe(3);
  });

  it("reorders immutably and preserves group payloads", () => {
    const result = reorderColorGroups(groups, 0, 2);
    expect(result.map((group) => group.query)).toEqual(["beta", "gamma", "alpha"]);
    expect(groups.map((group) => group.query)).toEqual(["alpha", "beta", "gamma"]);
    expect(result[0]?.color).not.toBe(groups[1]?.color);
  });

  it("uses the recovered 40 degree hue spacing for new groups", () => {
    expect(createGraphViewColorGroup(0, false)).toEqual({
      query: "",
      color: { a: 1, rgb: graphViewHslToRgb(0, 60, 60) },
    });
    expect(createGraphViewColorGroup(1, true, "#tag").query).toBe("#tag");
    expect(createGraphViewColorGroup(0, false).color.rgb).not.toBe(
      createGraphViewColorGroup(1, false).color.rgb,
    );
  });
});
