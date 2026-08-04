import { describe, expect, it } from "vitest";
import type { GraphViewSearchQuery } from "./data";
import {
  buildGraphViewData,
  type GraphViewFileRecord,
  projectGraphViewData,
  restrictGraphViewLocal,
} from "./data";
import { DEFAULT_GRAPH_VIEW_FILTERS } from "./options";

const files: GraphViewFileRecord[] = [
  {
    path: "root.md",
    extension: "md",
    resolvedLinks: ["child.md", "image.png"],
    unresolvedLinks: ["missing.md"],
    tags: ["#Root"],
  },
  { path: "child.md", extension: "md", resolvedLinks: ["root.md"], tags: ["#child"] },
  { path: "image.png", extension: "png" },
  { path: "orphan.md", extension: "md" },
];

const query = (matcher: Partial<GraphViewSearchQuery["matcher"]>): GraphViewSearchQuery => ({
  query: "test",
  color: null,
  matcher: {
    matchFile: () => false,
    matchTag: () => false,
    matchFilepath: () => false,
    ...matcher,
  },
});

describe("recovered Graph View data semantics", () => {
  it("applies attachment, unresolved, tag and orphan switches independently", () => {
    const graph = buildGraphViewData(files, {
      ...DEFAULT_GRAPH_VIEW_FILTERS,
      showAttachments: true,
      hideUnresolved: false,
      showTags: true,
      showOrphans: false,
    });

    expect(graph.nodes["root.md"]?.links).toEqual({
      "child.md": true,
      "image.png": true,
      "missing.md": true,
      "#Root": true,
    });
    expect(graph.nodes["image.png"]?.type).toBe("attachment");
    expect(graph.nodes["missing.md"]?.type).toBe("unresolved");
    expect(graph.nodes["#Root"]?.type).toBe("tag");
    expect(graph.nodes["orphan.md"]).toBeUndefined();
  });

  it("keeps color-only queries from filtering the vault", () => {
    const graph = buildGraphViewData(files, {
      ...DEFAULT_GRAPH_VIEW_FILTERS,
      queries: [
        {
          ...query({ matchFile: (file) => file.path === "child.md" }),
          color: { a: 1, rgb: 0xff00ff },
        },
      ],
    });

    expect(graph.hasFilter).toBe(false);
    expect(graph.nodes["root.md"]).toBeDefined();
    expect(graph.nodes["child.md"]?.color).toEqual({ a: 1, rgb: 0xff00ff });
  });

  it("keeps color matches while still applying every uncolored filter", () => {
    const graph = buildGraphViewData(files, {
      ...DEFAULT_GRAPH_VIEW_FILTERS,
      queries: [
        query({ matchFile: (file) => file.path !== "orphan.md" }),
        {
          ...query({ matchFile: (file) => file.path === "child.md" }),
          color: { a: 1, rgb: 0x00aaff },
        },
      ],
    });

    expect(graph.nodes["root.md"]).toBeDefined();
    expect(graph.nodes["child.md"]?.color).toEqual({ a: 1, rgb: 0x00aaff });
    expect(graph.nodes["orphan.md"]).toBeUndefined();
  });

  it("matches unresolved links by filepath instead of file metadata", () => {
    const graph = buildGraphViewData(files, {
      ...DEFAULT_GRAPH_VIEW_FILTERS,
      queries: [
        query({
          matchFile: (file) => file.path === "root.md",
          matchFilepath: (path) => path === "missing.md",
        }),
      ],
    });

    expect(graph.nodes["missing.md"]?.type).toBe("unresolved");
    expect(graph.nodes["root.md"]?.links).toEqual({ "missing.md": true });
  });

  it("counts and retains resolved links whose target is not in the cached file list", () => {
    const graph = buildGraphViewData(
      [{ path: "root.md", extension: "md", resolvedLinks: ["missing.md"] }],
      { ...DEFAULT_GRAPH_VIEW_FILTERS, hideUnresolved: true },
    );

    expect(graph.nodes["root.md"]?.links).toEqual({ "missing.md": true });
    expect(graph.nodes["missing.md"]).toBeUndefined();
    // One visible-file event plus one matching resolved-link event.
    expect(graph.numLinks).toBe(2);
  });

  it("does not materialize unresolved or tag nodes after a progression boundary", () => {
    const graph = buildGraphViewData(
      [
        { path: "root.md", extension: "md", unresolvedLinks: ["missing.md"], tags: ["#root"] },
        { path: "later.md", extension: "md" },
      ],
      { ...DEFAULT_GRAPH_VIEW_FILTERS, progression: 1, showTags: true },
    );

    expect(Object.keys(graph.nodes)).toEqual(["root.md"]);
    expect(graph.nodes["missing.md"]).toBeUndefined();
    expect(graph.nodes["#root"]).toBeUndefined();
    expect(graph.numLinks).toBe(4);
  });

  it("keeps the focused file visible through a hard filter", () => {
    const graph = buildGraphViewData(
      [
        { path: "root.md", extension: "md", resolvedLinks: ["child.md"] },
        { path: "child.md", extension: "md" },
      ],
      {
        ...DEFAULT_GRAPH_VIEW_FILTERS,
        currentFocusFile: "root.md",
        queries: [query({ matchFile: (file) => file.path === "child.md" })],
      },
    );

    expect(graph.nodes["root.md"]?.type).toBe("focused");
    expect(graph.nodes["child.md"]).toBeDefined();
    expect(graph.nodes["root.md"]?.links).toEqual({ "child.md": true });
  });

  it("requires every uncolored query to match a file", () => {
    const graph = buildGraphViewData(files, {
      ...DEFAULT_GRAPH_VIEW_FILTERS,
      queries: [query({ matchFile: (file) => file.path === "child.md" })],
    });

    expect(graph.hasFilter).toBe(true);
    expect(Object.keys(graph.nodes)).toEqual(["child.md"]);
  });

  it("expands local graph by hop and direction without inventing links", () => {
    const full = buildGraphViewData(files, {
      ...DEFAULT_GRAPH_VIEW_FILTERS,
      showAttachments: false,
      hideUnresolved: true,
      showTags: false,
    });
    const local = restrictGraphViewLocal(full, "root.md", {
      localJumps: 1,
      localInterlinks: false,
      localForelinks: true,
      localBacklinks: false,
    });

    expect(Object.keys(local.nodes).sort()).toEqual(["child.md", "root.md"]);
    expect(local.nodes["root.md"]?.links).toEqual({ "child.md": true });
    expect(local.weights).toMatchObject({ "root.md": 30, "child.md": 0 });
  });

  it("starts a local graph with an empty root adjacency table", () => {
    const local = restrictGraphViewLocal(
      {
        nodes: {
          root: { type: "", links: { child: true } },
          child: { type: "", links: {} },
        },
        numLinks: 1,
      },
      "root",
      {
        localJumps: 1,
        localInterlinks: false,
        localForelinks: false,
        localBacklinks: false,
      },
    );

    expect(local.nodes).toEqual({ root: { type: "", links: {} } });
    expect(local.numLinks).toBe(0);
  });

  it("returns a visible placeholder for an unknown local file", () => {
    const graph = restrictGraphViewLocal({ nodes: {}, numLinks: 0 }, "new.md", {
      localJumps: 3,
      localInterlinks: true,
      localForelinks: true,
      localBacklinks: true,
    });

    expect(graph.nodes).toEqual({ "new.md": { type: "", links: {} } });
    expect(graph.weights).toEqual({ "new.md": 30 });
  });

  it("projects explicit weights into stable renderer nodes and ignores missing targets", () => {
    const graph = projectGraphViewData(
      {
        nodes: {
          "root.md": { type: "focused", links: { "child.md": true, "missing.md": true } },
          "child.md": { type: "", links: {} },
        },
        weights: { "root.md": 30, "child.md": 0 },
        numLinks: 1,
      },
      { currentFocusFile: "root.md" },
    );

    expect(graph.nodes.map((node) => node.id)).toEqual(["root.md", "child.md"]);
    expect(graph.nodes[0]?.radius).toBeCloseTo(3 * Math.sqrt(31));
    expect(graph.links).toEqual([
      { id: "root.md→child.md", source: "root.md", target: "child.md" },
    ]);
    expect(graph.nodes[0]?.data?.type).toBe("focused");
  });

  it("sorts timelapse events by the earliest file timestamp and keeps the boundary file", () => {
    const graph = buildGraphViewData(
      [
        { path: "late.md", extension: "md", createdAt: 200 },
        { path: "early.md", extension: "md", createdAt: 100 },
        { path: "future.md", extension: "md", createdAt: 300 },
      ],
      {
        ...DEFAULT_GRAPH_VIEW_FILTERS,
        progression: 1,
      },
    );

    // The first file consumes event 0. Event 1 marks the second file as the
    // boundary, and the source deletes files after that boundary.
    expect(Object.keys(graph.nodes)).toEqual(["early.md", "late.md"]);
    expect(graph.numLinks).toBe(3);
  });

  it("adds an edge only while its progression event is inside the budget", () => {
    const graph = buildGraphViewData(
      [
        {
          path: "root.md",
          extension: "md",
          createdAt: 100,
          resolvedLinks: ["source.md"],
        },
        { path: "source.md", extension: "md", createdAt: 200 },
      ],
      {
        ...DEFAULT_GRAPH_VIEW_FILTERS,
        progression: 2,
      },
    );

    expect(graph.nodes["root.md"]?.links).toEqual({ "source.md": true });
    expect(graph.nodes["source.md"]).toBeDefined();
    expect(graph.numLinks).toBe(3);
  });
});
