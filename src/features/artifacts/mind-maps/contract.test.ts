import { describe, expect, it } from "vitest";
import {
  createMindMapSnapshotProjector,
  type MindMapRevisionContent,
  mindMapDraftSchema,
  mindMapRevisionContentSchema,
} from "./contract";

const valid: MindMapRevisionContent = {
  generation: { outcome: "complete", rawOutput: "{}", warnings: [] },
  nodes: [
    { id: "root", label: "Root", order: 0, parentId: null },
    { id: "a", label: "A", order: 0, parentId: "root" },
    { id: "b", label: "B", order: 1, parentId: "root" },
    { id: "a1", label: "A1", order: 0, parentId: "a" },
  ],
  rootId: "root",
  schemaVersion: 2,
};

describe("mind map contract", () => {
  it("accepts one reachable tree", () => {
    expect(mindMapRevisionContentSchema.parse(valid)).toEqual(valid);
  });

  it("accepts an empty-shell generated map because usefulness is decided by the user", () => {
    const emptyShell = { root: { children: [], label: "Topic" } };
    expect(mindMapDraftSchema.safeParse(emptyShell).success).toBe(true);
    expect(mindMapDraftSchema.safeParse({ root: { label: "Topic" } }).success).toBe(false);
    expect(
      mindMapRevisionContentSchema.safeParse({
        generation: valid.generation,
        nodes: [{ id: "root", label: "Topic", order: 0, parentId: null }],
        rootId: "root",
        schemaVersion: 2,
      }).success,
    ).toBe(true);
  });

  it("accepts a useful generated map", () => {
    expect(
      mindMapDraftSchema.safeParse({
        root: {
          children: [
            {
              children: [
                { children: [], label: "A1" },
                { children: [], label: "A2" },
              ],
              label: "A",
            },
            {
              children: [{ children: [], label: "B1" }],
              label: "B",
            },
            {
              children: [{ children: [], label: "C1" }],
              label: "C",
            },
          ],
          label: "Topic",
        },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["duplicate IDs", { ...valid, nodes: [...valid.nodes, { ...valid.nodes[1] }] }],
    [
      "orphan",
      {
        ...valid,
        nodes: valid.nodes.map((node) =>
          node.id === "a1" ? { ...node, parentId: "missing" } : node,
        ),
      },
    ],
    [
      "multiple roots",
      {
        ...valid,
        nodes: valid.nodes.map((node) => (node.id === "b" ? { ...node, parentId: null } : node)),
      },
    ],
    [
      "cycle",
      {
        ...valid,
        nodes: valid.nodes.map((node) => (node.id === "a" ? { ...node, parentId: "a1" } : node)),
      },
    ],
    [
      "duplicate sibling order",
      {
        ...valid,
        nodes: valid.nodes.map((node) => (node.id === "b" ? { ...node, order: 0 } : node)),
      },
    ],
  ])("rejects %s", (_, content) => {
    expect(mindMapRevisionContentSchema.safeParse(content).success).toBe(false);
  });

  it("accepts trees deeper than five edges", () => {
    const nodes = [{ id: "root", label: "Root", order: 0, parentId: null as string | null }];
    for (let depth = 1; depth <= 6; depth += 1) {
      nodes.push({
        id: `n${depth}`,
        label: `N${depth}`,
        order: 0,
        parentId: depth === 1 ? "root" : `n${depth - 1}`,
      });
    }
    expect(
      mindMapRevisionContentSchema.safeParse({
        generation: valid.generation,
        nodes,
        rootId: "root",
        schemaVersion: 2,
      }).success,
    ).toBe(true);
  });

  it("accepts more than 80 nodes and more than 10 children", () => {
    const tooManyChildren = Array.from({ length: 11 }, (_, index) => ({
      id: `c${index}`,
      label: `C${index}`,
      order: index,
      parentId: "root",
    }));
    expect(
      mindMapRevisionContentSchema.safeParse({
        generation: valid.generation,
        nodes: [valid.nodes[0], ...tooManyChildren],
        rootId: "root",
        schemaVersion: 2,
      }).success,
    ).toBe(true);
    const tooManyNodes = Array.from({ length: 81 }, (_, index) => ({
      id: `n${index}`,
      label: `N${index}`,
      order: index === 0 ? 0 : index - 1,
      parentId: index === 0 ? null : "n0",
    }));
    expect(
      mindMapRevisionContentSchema.safeParse({
        generation: valid.generation,
        nodes: tooManyNodes,
        rootId: "n0",
        schemaVersion: 2,
      }).success,
    ).toBe(true);
  });

  it("keeps IDs stable while a streamed tree grows", () => {
    let nextId = 0;
    const project = createMindMapSnapshotProjector(() => `id-${nextId++}`);
    const first = project({
      root: { label: "Topic", children: [{ label: "A", children: [] }] },
    });
    const second = project({
      root: {
        label: "Topic",
        children: [
          { label: "A", children: [{ label: "A1", children: [] }] },
          { label: "B", children: [] },
        ],
      },
    });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second?.rootId).toBe(first?.rootId);
    expect(second?.nodes.find((node) => node.label === "A")?.id).toBe(
      first?.nodes.find((node) => node.label === "A")?.id,
    );
  });
});
