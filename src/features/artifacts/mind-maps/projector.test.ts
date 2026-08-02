import { describe, expect, test } from "vitest";
import { mindMapRevisionContentSchema } from "./contract";
import { projectMindMap } from "./projector";

describe("mind map projection", () => {
  test("projects the canonical generated tree shape", () => {
    let id = 0;
    const projection = projectMindMap({
      idFactory: () => `fixed-${++id}`,
      outcome: "complete",
      rawOutput: JSON.stringify({
        root: {
          children: [
            { children: [], label: "A" },
            { children: [], label: "B" },
          ],
          label: "Topic",
        },
      }),
    });
    expect(mindMapRevisionContentSchema.parse(projection.revision)).toEqual(projection.revision);
    expect(projection.revision.nodes.map((node) => node.label)).toEqual(["Topic", "A", "B"]);
    expect(projection.revision.nodes.filter((node) => node.parentId === null)).toHaveLength(1);
  });

  test.each([
    "机器学习\n监督学习\n无监督学习",
    JSON.stringify({
      nodes: [{ id: "root", label: "机器学习", parentId: null }],
      rootId: "root",
    }),
  ])("rejects non-canonical output instead of publishing a fallback revision", (rawOutput) => {
    expect(() => projectMindMap({ outcome: "partial", rawOutput })).toThrow(
      "mind_map_invalid_output",
    );
  });

  test("publishes a structurally valid interrupted output as partial", () => {
    const rawOutput = JSON.stringify({
      root: { children: [], label: "机器学习" },
    });
    const projection = projectMindMap({ outcome: "partial", rawOutput });
    expect(projection.rawOutput).toBe(rawOutput);
    expect(projection.warnings).toEqual(["partial_generation"]);
  });
});
