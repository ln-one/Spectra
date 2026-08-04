import { degreeWeightedRadius } from "./forces";
import type { GraphViewColor, GraphViewFilterOptions, GraphViewQuery } from "./options";
import type { GraphViewData, GraphViewEdgeInput, GraphViewNodeInput } from "./types";

export type GraphViewFileRecord = {
  path: string;
  extension: string;
  resolvedLinks?: readonly string[];
  unresolvedLinks?: readonly string[];
  tags?: readonly string[];
  ignored?: boolean;
  supported?: boolean;
  createdAt?: number;
  modifiedAt?: number;
};

type GraphViewNodeType = "" | "tag" | "unresolved" | "attachment" | "focused";

type GraphViewVaultNode = {
  type: GraphViewNodeType;
  links: Record<string, true>;
  color?: GraphViewColor;
};

export type GraphViewVaultGraph = {
  nodes: Record<string, GraphViewVaultNode>;
  weights?: Record<string, number>;
  numLinks: number;
};

type GraphViewQueryMatcher = {
  matchFile: (file: GraphViewFileRecord) => boolean;
  matchTag: (tag: string) => boolean;
  matchFilepath: (path: string) => boolean;
};

export type GraphViewSearchQuery = GraphViewQuery & {
  matcher: GraphViewQueryMatcher;
};

export type BuildGraphViewDataOptions = GraphViewFilterOptions & {
  currentFocusFile?: string | null;
  queries?: readonly GraphViewSearchQuery[] | null;
  /**
   * The full Graph View uses this as an event budget while timelapse is
   * active. A null/zero value means that the complete graph is built.
   */
  progression?: number | null;
};

export type GraphViewDataResult = GraphViewVaultGraph & {
  fileFilter: Record<string, boolean | GraphViewColor>;
  hasFilter: boolean;
};

export type GraphViewProjectedNodeData = {
  label: string;
  type: GraphViewNodeType;
  color?: string;
};

export type ProjectGraphViewOptions = {
  currentFocusFile?: string | null;
};

const TAG_NODE_TYPE: GraphViewNodeType = "tag";

function isAttachment(path: string): boolean {
  const extension = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1) : "";
  return extension.toLowerCase() !== "md";
}

function node(type: GraphViewNodeType = ""): GraphViewVaultNode {
  return { type, links: {} };
}

function cloneNode(value: GraphViewVaultNode | undefined): GraphViewVaultNode {
  if (!value) return node();
  return {
    type: value.type,
    links: { ...value.links },
    ...(value.color ? { color: { ...value.color } } : {}),
  };
}

function canonicalTags(files: readonly GraphViewFileRecord[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const file of files) {
    for (const tag of file.tags ?? []) {
      const key = tag.toLowerCase();
      if (!result.has(key)) result.set(key, tag);
    }
  }
  return result;
}

function computeFileFilter(
  files: readonly GraphViewFileRecord[],
  queries: readonly GraphViewSearchQuery[] | null | undefined,
): { fileFilter: Record<string, boolean | GraphViewColor>; hasFilter: boolean } {
  if (!queries || queries.length === 0) return { fileFilter: {}, hasFilter: false };

  const fileFilter: Record<string, boolean | GraphViewColor> = {};
  const hasFilter = queries.some((query) => query.color === null);
  for (const file of files) {
    if (file.ignored || file.supported === false) continue;
    let matches = true;
    let color: GraphViewColor | null = null;
    for (const query of queries) {
      const matched = query.matcher.matchFile(file);
      if (!matched && query.color === null) {
        matches = false;
      }
      if (matched && query.color !== null && color === null) {
        color = query.color;
      }
    }
    fileFilter[file.path] = matches ? (color ?? true) : false;
  }
  return { fileFilter, hasFilter };
}

function removeOrphans(nodes: Record<string, GraphViewVaultNode>): void {
  const hasInbound = new Set<string>();
  for (const [id, value] of Object.entries(nodes)) {
    for (const target of Object.keys(value.links)) {
      if (target !== id) hasInbound.add(target);
    }
  }

  for (const [id, value] of Object.entries(nodes)) {
    const hasOutbound = Object.keys(value.links).some(
      (target) => target !== id && nodes[target] !== undefined,
    );
    if (!hasOutbound && !hasInbound.has(id)) delete nodes[id];
  }
}

function progressionTimestamp(file: GraphViewFileRecord): number {
  const timestamps = [file.createdAt, file.modifiedAt].filter((value): value is number =>
    Number.isFinite(value),
  );
  return timestamps.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...timestamps);
}

function progressionFiles(
  files: readonly GraphViewFileRecord[],
  progression: number | null | undefined,
): readonly GraphViewFileRecord[] {
  if (!progression || progression <= 0) return files;
  return [...files].sort((left, right) => progressionTimestamp(left) - progressionTimestamp(right));
}

/**
 * Restrict a complete graph to the same local-neighbour semantics as the
 * recovered engine. The returned weights are the local-graph weights, not
 * the full-graph degree values.
 */
export function restrictGraphViewLocal(
  graph: GraphViewVaultGraph,
  localFile: string,
  options: Pick<
    GraphViewFilterOptions,
    "localJumps" | "localInterlinks" | "localForelinks" | "localBacklinks"
  >,
): GraphViewVaultGraph {
  const original = graph.nodes;
  const selected: Record<string, GraphViewVaultNode> = {};
  const weights: Record<string, number> = { [localFile]: 30 };
  const root = original[localFile];

  if (!root) {
    selected[localFile] = node();
    return { nodes: selected, weights, numLinks: 0 };
  }

  // The original local-graph reducer starts with a fresh root record. It
  // does not copy the complete root adjacency table before the jump-limited
  // expansion; doing so leaks edges outside the requested local radius.
  selected[localFile] = node(root.type);
  const jumps = Math.max(1, Math.round(options.localJumps));
  const stepWeight = 30 / jumps;

  const expand = (weight: number): void => {
    const additions: Record<string, GraphViewVaultNode> = {};
    for (const [sourceId, sourceNode] of Object.entries(original)) {
      // The source implementation does not expand outgoing or incoming
      // relationships from tag nodes in a local graph.
      if (sourceNode.type === TAG_NODE_TYPE) continue;
      const selectedSource = selected[sourceId];
      for (const targetId of Object.keys(sourceNode.links)) {
        const selectedTarget = selected[targetId];
        if (
          options.localForelinks &&
          selectedSource &&
          !selectedTarget &&
          selectedSource.type !== TAG_NODE_TYPE
        ) {
          additions[targetId] = cloneNode(original[targetId]);
          selectedSource.links[targetId] = true;
        } else if (
          options.localBacklinks &&
          selectedTarget &&
          !selectedSource &&
          selectedTarget.type !== TAG_NODE_TYPE
        ) {
          const addition = additions[sourceId] ?? cloneNode(original[sourceId]);
          addition.links[targetId] = true;
          additions[sourceId] = addition;
        }
      }
    }
    for (const [id, value] of Object.entries(additions)) {
      selected[id] = value;
      weights[id] = weight;
    }
  };

  for (let index = 0; index < jumps; index += 1) {
    expand(30 - stepWeight * (index + 1));
  }

  if (options.localInterlinks) {
    for (const id of Object.keys(selected)) {
      const originalNode = original[id];
      if (originalNode) selected[id] = originalNode;
    }
  }

  return {
    nodes: selected,
    weights,
    numLinks: Object.values(selected).reduce(
      (sum, value) => sum + Object.keys(value.links).length,
      0,
    ),
  };
}

/** Build the vault graph before it is projected into the Pixi renderer. */
export function buildGraphViewData(
  files: readonly GraphViewFileRecord[],
  options: BuildGraphViewDataOptions,
): GraphViewDataResult {
  const queries = options.queries ?? null;
  const progression = options.progression && options.progression > 0 ? options.progression : null;
  const orderedFiles = progressionFiles(files, progression);
  const { fileFilter, hasFilter } = computeFileFilter(files, queries);
  const tagByKey = canonicalTags(files);
  const nodes: Record<string, GraphViewVaultNode> = {};
  let progressionEventCount = 0;
  let progressionBoundaryFile: string | null = null;

  const matchesGraphPath = (
    path: string,
    kind: "file" | "unresolved" | "attachment" | "tag",
    tag?: string,
  ): boolean => {
    if (!queries || queries.length === 0) return true;
    if (kind === "file") {
      // The global builder keeps the focused file visible even when a hard
      // search filter would otherwise exclude it.
      return (
        options.currentFocusFile === path ||
        (Object.hasOwn(fileFilter, path) ? Boolean(fileFilter[path]) : !hasFilter)
      );
    }
    if (kind === "tag") {
      return queries.every(
        (query) => query.color !== null || (tag !== undefined && query.matcher.matchTag(tag)),
      );
    }
    return queries.every((query) => query.color !== null || query.matcher.matchFilepath(path));
  };

  const allowFile = (file: GraphViewFileRecord): boolean => {
    if (file.ignored || file.supported === false) return false;
    const attachment = isAttachment(file.path);
    if (attachment && !options.showAttachments) return false;
    if (attachment) {
      return matchesGraphPath(file.path, "attachment");
    }
    return matchesGraphPath(file.path, "file");
  };

  const addLink = (from: string, to: string): void => {
    if (from === to) return;
    const source = nodes[from];
    if (!source || source.links[to]) return;
    source.links[to] = true;
  };

  const consumeProgressionEvent = (ownerFile: string): boolean => {
    const included = progression === null || progressionEventCount < progression;
    if (progression !== null && progressionEventCount === progression) {
      progressionBoundaryFile = ownerFile;
    }
    progressionEventCount += 1;
    return included;
  };

  for (const file of orderedFiles) {
    if (!allowFile(file)) continue;
    const value = node(isAttachment(file.path) ? "attachment" : "");
    // A real cached file replaces an earlier unresolved placeholder. The
    // reference builder assigns a fresh record instead of merging adjacency.
    nodes[file.path] = value;
    const fileColor = fileFilter[file.path];
    if (fileColor && typeof fileColor !== "boolean") value.color = { ...fileColor };

    // The source increments this counter for every visible file when orphan
    // display is enabled, even when the current event is already past the
    // timelapse budget. The later boundary pass removes file nodes after the
    // boundary, which is why this is intentionally not an early `continue`.
    if (options.showOrphans) consumeProgressionEvent(file.path);

    for (const target of file.resolvedLinks ?? []) {
      const attachment = isAttachment(target);
      if (!options.showAttachments && attachment) continue;
      if (!matchesGraphPath(target, attachment ? "attachment" : "file")) continue;
      if (consumeProgressionEvent(file.path)) addLink(file.path, target);
    }

    if (!options.hideUnresolved) {
      for (const target of file.unresolvedLinks ?? []) {
        if (!matchesGraphPath(target, "unresolved")) continue;
        if (consumeProgressionEvent(file.path)) {
          addLink(file.path, target);
          if (!nodes[target]) nodes[target] = node("unresolved");
        }
      }
    }

    if (options.showTags) {
      for (const tag of file.tags ?? []) {
        if (!matchesGraphPath(tag, "tag", tag)) continue;
        const tagId = tagByKey.get(tag.toLowerCase()) ?? tag;
        if (consumeProgressionEvent(file.path)) {
          addLink(file.path, tagId);
          if (!nodes[tagId]) nodes[tagId] = node("tag");
        }
      }
    }
  }

  if (progression !== null && progressionBoundaryFile) {
    const boundaryIndex = orderedFiles.findIndex((file) => file.path === progressionBoundaryFile);
    if (boundaryIndex !== -1) {
      for (let index = boundaryIndex + 1; index < orderedFiles.length; index += 1) {
        delete nodes[orderedFiles[index]?.path ?? ""];
      }
    }
  }

  // `f` in the bundle counts matching link/tag events, not only unique
  // renderer edges. The controller uses this value for timelapse speed.
  let graph: GraphViewVaultGraph = { nodes, numLinks: progressionEventCount };
  // Local projection happens before orphan pruning in the reference engine.
  if (options.localFile) graph = restrictGraphViewLocal(graph, options.localFile, options);
  if (!options.showOrphans) removeOrphans(graph.nodes);
  if (options.currentFocusFile) {
    const focused = graph.nodes[options.currentFocusFile];
    if (focused) focused.type = "focused";
  }
  return { ...graph, fileFilter, hasFilter };
}

/**
 * Project the adjacency-table representation into the stable renderer input.
 * Missing link targets are ignored rather than creating visual placeholders;
 * unresolved placeholders are already represented as real nodes by the data
 * builder when that option is enabled.
 */
export function projectGraphViewData(
  graph: GraphViewVaultGraph,
  options: ProjectGraphViewOptions = {},
): GraphViewData<GraphViewProjectedNodeData> {
  const nodeIds = Object.keys(graph.nodes);
  const nodeIdSet = new Set(nodeIds);
  const degreeById = new Map<string, number>();
  const links: GraphViewEdgeInput[] = [];
  const seenLinks = new Set<string>();

  for (const sourceId of nodeIds) {
    const source = graph.nodes[sourceId];
    if (!source) continue;
    for (const targetId of Object.keys(source.links)) {
      if (!nodeIdSet.has(targetId) || sourceId === targetId) continue;
      const linkKey = `${sourceId}\u0000${targetId}`;
      if (seenLinks.has(linkKey)) continue;
      seenLinks.add(linkKey);
      links.push({ id: `${sourceId}→${targetId}`, source: sourceId, target: targetId });
      degreeById.set(sourceId, (degreeById.get(sourceId) ?? 0) + 1);
      degreeById.set(targetId, (degreeById.get(targetId) ?? 0) + 1);
    }
  }

  const nodes: GraphViewNodeInput<GraphViewProjectedNodeData>[] = nodeIds.map((id) => {
    const source = graph.nodes[id];
    const weight = graph.weights?.[id] ?? degreeById.get(id) ?? 0;
    const color = source?.color ? rgbColorToHex(source.color.rgb) : undefined;
    return {
      id,
      weight,
      // Node size is a render option in the original renderer. Store only
      // the stable weight-derived base radius here; applying the display
      // multiplier during projection would multiply it a second time in the
      // Pixi canvas.
      radius: degreeWeightedRadius(weight),
      data: {
        label: id,
        type: id === options.currentFocusFile ? "focused" : (source?.type ?? ""),
        ...(color ? { color } : {}),
      },
    };
  });

  return { nodes, links, ...(graph.weights ? { weights: graph.weights } : {}) };
}

function rgbColorToHex(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;
}
