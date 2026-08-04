/**
 * Public Graph View settings recovered from the local renderer bundle.
 *
 * The renderer stores force strengths in simulation units, while the settings
 * panel exposes non-linear controls. Keeping both representations explicit is
 * important: serialising the slider value as if it were the worker value
 * changes the feel of the graph substantially.
 */

export type GraphViewFilterOptions = {
  showAttachments: boolean;
  hideUnresolved: boolean;
  showOrphans: boolean;
  showTags: boolean;
  localFile: string | null;
  localJumps: number;
  localInterlinks: boolean;
  localForelinks: boolean;
  localBacklinks: boolean;
};

export type GraphViewDisplayOptions = {
  showArrow: boolean;
  textFadeMultiplier: number;
  nodeSizeMultiplier: number;
  lineSizeMultiplier: number;
};

export type GraphViewForceOptions = {
  centerStrength: number;
  repelStrength: number;
  linkStrength: number;
  linkDistance: number;
};

export type GraphViewColor = {
  a: number;
  rgb: number;
};

export type GraphViewColorGroup = {
  query: string;
  color: GraphViewColor;
};

export type GraphViewQuery = {
  query: string;
  /** A color marks a group query; null marks a filtering query. */
  color: GraphViewColor | null;
};

export type GraphViewOptions = {
  /** The uncolored search query is the graph's hard filter. */
  search: string;
  filters: GraphViewFilterOptions;
  display: GraphViewDisplayOptions;
  forces: GraphViewForceOptions;
  colorGroups: GraphViewColorGroup[];
};

export type GraphViewOptionsPatch = {
  search?: string;
  filters?: Partial<GraphViewFilterOptions>;
  display?: Partial<GraphViewDisplayOptions>;
  forces?: Partial<GraphViewForceOptions>;
  colorGroups?: readonly GraphViewColorGroup[];
};

/**
 * The controller persists a flat option object. The four collapsible section
 * flags are part of that public snapshot even though the engine keeps the
 * actual settings grouped by concern.
 */
export type GraphViewOptionsSnapshot = GraphViewFilterOptions &
  GraphViewDisplayOptions &
  GraphViewForceOptions & {
    search: string;
    colorGroups: GraphViewColorGroup[];
    scale: number;
    close: boolean;
    "collapse-filter": boolean;
    "collapse-color-groups": boolean;
    "collapse-display": boolean;
    "collapse-forces": boolean;
  };

export type GraphViewOptionsSnapshotMeta = {
  scale?: number;
  close?: boolean;
  collapsed?: Partial<
    Pick<
      GraphViewOptionsSnapshot,
      "collapse-filter" | "collapse-color-groups" | "collapse-display" | "collapse-forces"
    >
  >;
};

export const DEFAULT_GRAPH_VIEW_FILTERS: GraphViewFilterOptions = {
  showAttachments: false,
  hideUnresolved: false,
  showOrphans: true,
  showTags: false,
  localFile: null,
  localJumps: 1,
  localInterlinks: false,
  localForelinks: true,
  localBacklinks: true,
};

export const DEFAULT_GRAPH_VIEW_DISPLAY: GraphViewDisplayOptions = {
  showArrow: false,
  textFadeMultiplier: 0,
  nodeSizeMultiplier: 1,
  lineSizeMultiplier: 1,
};

/** Values stored by the original graph controller, not slider positions. */
export const DEFAULT_GRAPH_VIEW_FORCE_OPTIONS: GraphViewForceOptions = {
  centerStrength: inverseForceControl(0.1, 0.01),
  // The settings panel stores the public slider value. The controller maps it
  // through x ** 3 before sending the simulation value to the worker.
  repelStrength: 10,
  linkStrength: inverseForceControl(1, 0.01),
  linkDistance: 250,
};

export const DEFAULT_GRAPH_VIEW_OPTIONS: GraphViewOptions = {
  search: "",
  filters: { ...DEFAULT_GRAPH_VIEW_FILTERS },
  display: { ...DEFAULT_GRAPH_VIEW_DISPLAY },
  forces: { ...DEFAULT_GRAPH_VIEW_FORCE_OPTIONS },
  colorGroups: [],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Inverse of the public-to-worker force mapping used by the bundle.
 *
 * `t` is the curve floor (the original settings panel uses .01). The formula
 * is deliberately kept in this form instead of approximating it with a
 * hand-picked easing curve.
 */
export function forceControl(value: number, t = 0.01): number {
  const safeValue = clamp(value, 0, 1);
  if (!(t > 0 && t < 1)) return safeValue;
  return (t ** (1 - safeValue) - t) / (1 - t);
}

/** Convert an internal force strength back to the displayed 0..1 control. */
export function inverseForceControl(value: number, t = 0.01): number {
  const safeValue = clamp(value, 0, 1);
  if (!(t > 0 && t < 1)) return safeValue;
  return 1 - Math.log(safeValue * (1 - t) + t) / Math.log(t);
}

export function repelControl(value: number): number {
  const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);
  return safeValue ** 3;
}

export function normalizeLocalJumps(value: number): number {
  return Math.round(clamp(Number.isFinite(value) ? value : 1, 1, 5));
}

export function graphViewQueries(
  search: string,
  colorGroups: readonly GraphViewColorGroup[],
): GraphViewQuery[] {
  const queries: GraphViewQuery[] = [];
  const normalizedSearch = search.trim();
  if (normalizedSearch) queries.push({ query: normalizedSearch, color: null });
  for (const group of colorGroups) {
    queries.push({ query: group.query, color: group.color });
  }
  return queries;
}

export function hasFilteringQuery(queries: readonly GraphViewQuery[]): boolean {
  return queries.some((query) => query.color === null);
}

export function cloneGraphViewOptions(options: GraphViewOptionsPatch = {}): GraphViewOptions {
  return {
    search: options.search ?? "",
    filters: {
      ...DEFAULT_GRAPH_VIEW_FILTERS,
      ...(options.filters ?? {}),
      localJumps: normalizeLocalJumps(
        options.filters?.localJumps ?? DEFAULT_GRAPH_VIEW_FILTERS.localJumps,
      ),
    },
    display: { ...DEFAULT_GRAPH_VIEW_DISPLAY, ...(options.display ?? {}) },
    forces: { ...DEFAULT_GRAPH_VIEW_FORCE_OPTIONS, ...(options.forces ?? {}) },
    colorGroups: (options.colorGroups ?? []).map((group) => ({
      query: group.query,
      color: { ...group.color },
    })),
  };
}

/**
 * Reproduce the flat object emitted by the original controller's getOptions.
 * This is deliberately separate from the nested runtime representation so a
 * persisted snapshot can be round-tripped without leaking UI concerns into
 * the graph data builder.
 */
export function graphViewOptionsSnapshot(
  options: GraphViewOptions = DEFAULT_GRAPH_VIEW_OPTIONS,
  meta: GraphViewOptionsSnapshotMeta = {},
): GraphViewOptionsSnapshot {
  const cloned = cloneGraphViewOptions(options);
  const collapsed = meta.collapsed ?? {};
  return {
    search: cloned.search,
    ...cloned.filters,
    ...cloned.display,
    ...cloned.forces,
    colorGroups: cloned.colorGroups.map((group) => ({
      query: group.query,
      color: { ...group.color },
    })),
    scale: meta.scale ?? 1,
    close: meta.close ?? false,
    "collapse-filter": collapsed["collapse-filter"] ?? true,
    "collapse-color-groups": collapsed["collapse-color-groups"] ?? true,
    "collapse-display": collapsed["collapse-display"] ?? true,
    "collapse-forces": collapsed["collapse-forces"] ?? true,
  };
}

/** Convert a persisted flat controller snapshot back to runtime options. */
export function graphViewOptionsFromSnapshot(
  snapshot: Partial<GraphViewOptionsSnapshot> | null | undefined,
): GraphViewOptions {
  return cloneGraphViewOptions({
    search: snapshot?.search ?? "",
    filters: {
      showAttachments: snapshot?.showAttachments ?? DEFAULT_GRAPH_VIEW_FILTERS.showAttachments,
      hideUnresolved: snapshot?.hideUnresolved ?? DEFAULT_GRAPH_VIEW_FILTERS.hideUnresolved,
      showOrphans: snapshot?.showOrphans ?? DEFAULT_GRAPH_VIEW_FILTERS.showOrphans,
      showTags: snapshot?.showTags ?? DEFAULT_GRAPH_VIEW_FILTERS.showTags,
      localFile: snapshot?.localFile ?? DEFAULT_GRAPH_VIEW_FILTERS.localFile,
      localJumps: snapshot?.localJumps ?? DEFAULT_GRAPH_VIEW_FILTERS.localJumps,
      localInterlinks: snapshot?.localInterlinks ?? DEFAULT_GRAPH_VIEW_FILTERS.localInterlinks,
      localForelinks: snapshot?.localForelinks ?? DEFAULT_GRAPH_VIEW_FILTERS.localForelinks,
      localBacklinks: snapshot?.localBacklinks ?? DEFAULT_GRAPH_VIEW_FILTERS.localBacklinks,
    },
    display: {
      showArrow: snapshot?.showArrow ?? DEFAULT_GRAPH_VIEW_DISPLAY.showArrow,
      textFadeMultiplier:
        snapshot?.textFadeMultiplier ?? DEFAULT_GRAPH_VIEW_DISPLAY.textFadeMultiplier,
      nodeSizeMultiplier:
        snapshot?.nodeSizeMultiplier ?? DEFAULT_GRAPH_VIEW_DISPLAY.nodeSizeMultiplier,
      lineSizeMultiplier:
        snapshot?.lineSizeMultiplier ?? DEFAULT_GRAPH_VIEW_DISPLAY.lineSizeMultiplier,
    },
    forces: {
      centerStrength: snapshot?.centerStrength ?? DEFAULT_GRAPH_VIEW_FORCE_OPTIONS.centerStrength,
      repelStrength: snapshot?.repelStrength ?? DEFAULT_GRAPH_VIEW_FORCE_OPTIONS.repelStrength,
      linkStrength: snapshot?.linkStrength ?? DEFAULT_GRAPH_VIEW_FORCE_OPTIONS.linkStrength,
      linkDistance: snapshot?.linkDistance ?? DEFAULT_GRAPH_VIEW_FORCE_OPTIONS.linkDistance,
    },
    colorGroups: snapshot?.colorGroups ?? [],
  });
}
