import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { MindMapRevisionContent } from "./contract";
import {
  applyMindMapRefineEdits,
  classifyMindMapProposal,
  countMindMapRefineChanges,
  mindMapProposalRefineEditsSchema,
  mindMapRefineEditsSchema,
  reviewMindMapProposalScope,
  validateMindMapFocus,
} from "./refine";

it("classifies canonical proposal changes by stable node ID", () => {
  const before = content;
  const after = applyMindMapRefineEdits(
    before,
    [
      { id: "a", label: "Updated A", type: "update" },
      { direction: "up", id: "b", type: "move" },
      { label: "New child", note: "", parentId: "a", type: "add_child" },
      { id: "a1", type: "delete_subtree" },
    ],
    () => "new-child",
  );

  const diff = classifyMindMapProposal(before, after);

  expect(diff.changes.get("new-child")?.state).toBe("added");
  expect(diff.changes.get("a")?.state).toBe("moved");
  expect(diff.changes.get("a")?.previousLabel).toBe("A");
  expect(diff.changes.get("b")?.state).toBe("moved");
  expect(diff.changes.get("a1")?.state).toBe("deleted");
  expect(diff.deletedNodeIds).toEqual(new Set(["a1"]));
  expect(diff.changes.get("root")?.state).toBe("unchanged");
});

it("marks an unchanged parent as the scope of added children", () => {
  const after = applyMindMapRefineEdits(
    content,
    [
      { id: "a1", label: "Updated leaf", type: "update" },
      { label: "New B child", note: "", parentId: "b", type: "add_child" },
    ],
    () => "new-b-child",
  );

  const diff = classifyMindMapProposal(content, after);

  expect(diff.changes.get("a1")).toMatchObject({ previousLabel: "A1", state: "updated" });
  expect(diff.changes.get("new-b-child")?.state).toBe("added");
  expect(diff.changes.get("b")?.state).toBe("scope");
  expect(diff.deletedNodeIds.size).toBe(0);
});

it("classifies identical revisions as unchanged", () => {
  const diff = classifyMindMapProposal(content, content);

  expect([...diff.changes.values()].every((change) => change.state === "unchanged")).toBe(true);
  expect(diff.deletedNodeIds.size).toBe(0);
});

const revisionId = "00000000-0000-4000-8000-000000000001";
const content: MindMapRevisionContent = {
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

describe("mind map scoped refine", () => {
  it("resolves selected roots to a subtree and restricted context", () => {
    const focus = validateMindMapFocus(content, {
      kind: "mind_map_subtrees",
      nodeIds: ["a"],
      revisionId,
    });
    expect(focus?.allowedNodeIds).toEqual(["a", "a1"]);
    expect(focus?.contextMarkdown).toContain("Root > A");
    expect(focus?.contextMarkdown).not.toContain("[node:b]");
  });

  it("rejects targets and indirect sibling moves outside the subtree", () => {
    const focus = validateMindMapFocus(content, {
      kind: "mind_map_subtrees",
      nodeIds: ["a"],
      revisionId,
    });
    expect(
      reviewMindMapProposalScope(content, focus, [{ id: "a1", label: "A1+", type: "update" }]),
    ).toEqual({ status: "allowed" });
    expect(
      reviewMindMapProposalScope(content, focus, [{ id: "b", label: "B+", type: "update" }]),
    ).toMatchObject({ status: "outside_scope" });
    expect(
      reviewMindMapProposalScope(content, focus, [{ direction: "down", id: "a", type: "move" }]),
    ).toMatchObject({ status: "outside_scope" });
  });

  it("applies valid edits and server-owned IDs", () => {
    const updated = applyMindMapRefineEdits(
      content,
      [{ label: "A2", note: "", parentId: "a", type: "add_child" }],
      () => "a2",
    );
    expect(updated.nodes.find((node) => node.id === "a2")).toMatchObject({ parentId: "a" });
  });

  it("adds a complete flat multi-level tree atomically with server-owned IDs", () => {
    const ids = ["layer-1", "layer-2-a", "layer-3", "layer-2-b"];
    const edits = mindMapRefineEditsSchema.parse([
      {
        levels: 3,
        nodes: [
          { key: "layer-1", label: "Layer 1", parentKey: null },
          { key: "layer-2-a", label: "Layer 2 A", parentKey: "layer-1" },
          { key: "layer-3", label: "Layer 3", parentKey: "layer-2-a" },
          { key: "layer-3-b", label: "Layer 3 B", parentKey: "layer-2-a" },
        ],
        parentId: "a",
        type: "add_tree",
      },
    ]);

    const updated = applyMindMapRefineEdits(content, edits, () => {
      const id = ids.shift();
      if (!id) throw new Error("missing_test_id");
      return id;
    });

    expect(updated.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "layer-1", parentId: "a" }),
        expect.objectContaining({ id: "layer-2-a", parentId: "layer-1" }),
        expect.objectContaining({ id: "layer-3", parentId: "layer-2-a" }),
        expect.objectContaining({ id: "layer-2-b", parentId: "layer-2-a" }),
      ]),
    );
    expect(countMindMapRefineChanges(edits)).toBe(4);
  });

  it("counts flat tree additions against the 50-change proposal limit", () => {
    const nodes = Array.from({ length: 50 }, (_, index) => ({
      key: `child-${index}`,
      label: `Child ${index}`,
      parentKey: null,
    }));
    expect(
      mindMapRefineEditsSchema.safeParse([
        { levels: 1, nodes, parentId: "a", type: "add_tree" },
        { label: "One too many", parentId: "a", type: "add_child" },
      ]).success,
    ).toBe(false);
  });

  it("requires local tree parents to exist without cycles", () => {
    expect(
      mindMapRefineEditsSchema.safeParse([
        {
          levels: 1,
          nodes: [{ key: "child", label: "Child", parentKey: "missing" }],
          parentId: "a",
          type: "add_tree",
        },
      ]).success,
    ).toBe(false);
    expect(
      mindMapRefineEditsSchema.safeParse([
        {
          levels: 2,
          nodes: [
            { key: "one", label: "One", parentKey: "two" },
            { key: "two", label: "Two", parentKey: "one" },
          ],
          parentId: "a",
          type: "add_tree",
        },
      ]).success,
    ).toBe(false);
  });

  it("requires every proposed branch to reach its declared level count", () => {
    expect(
      mindMapProposalRefineEditsSchema.safeParse([
        {
          levels: 2,
          nodes: [{ key: "child", label: "Child", parentKey: null }],
          parentId: "a",
          type: "add_tree",
        },
      ]).success,
    ).toBe(false);
  });

  it("exposes only flat complete trees to the proposal model", () => {
    const jsonSchema = JSON.stringify(z.toJSONSchema(mindMapProposalRefineEditsSchema));
    expect(jsonSchema).not.toContain('"$ref"');
    expect(jsonSchema).not.toContain('"add_child"');
  });
});
