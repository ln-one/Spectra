import { describe, expect, it } from "vitest";
import { STUDIO_TOOL_IDS, STUDIO_TOOL_PRESENTATIONS, studioToolTone } from "./studioTools";

describe("studio tool presentation map", () => {
  it("defines one stable, distinct identity tone for every current tool", () => {
    expect(STUDIO_TOOL_IDS).toEqual([
      "smart-slides",
      "teaching-document",
      "mind-map",
      "interactive-game",
      "quiz",
      "animation",
    ]);

    const tones = STUDIO_TOOL_IDS.map((toolId) => studioToolTone(toolId));
    expect(tones).toEqual(["orange", "blue", "teal", "rose", "violet", "green"]);
    expect(new Set(tones).size).toBe(STUDIO_TOOL_IDS.length);
    expect(Object.keys(STUDIO_TOOL_PRESENTATIONS)).toEqual([...STUDIO_TOOL_IDS]);
  });
});
