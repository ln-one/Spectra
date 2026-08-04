import {
  cloneGraphViewOptions,
  DEFAULT_GRAPH_VIEW_OPTIONS,
  type GraphViewOptions,
  type GraphViewOptionsPatch,
  type GraphViewOptionsSnapshot,
  type GraphViewOptionsSnapshotMeta,
  graphViewOptionsFromSnapshot,
  graphViewOptionsSnapshot,
} from "./options";

/**
 * The controller is the serialisation boundary around the renderer.
 *
 * The original graph view keeps its runtime options grouped by settings
 * section, but persists a flat object that also contains zoom, close state,
 * and section collapse state. Keeping that boundary explicit prevents UI
 * state from leaking into the graph builder and makes persisted layouts
 * portable between the standalone engine and a host application.
 */
type GraphViewCollapsedSections = Pick<
  GraphViewOptionsSnapshot,
  "collapse-filter" | "collapse-color-groups" | "collapse-display" | "collapse-forces"
>;

export type GraphViewControllerState = {
  options: GraphViewOptions;
  scale: number;
  close: boolean;
  collapsed: GraphViewCollapsedSections;
};

const DEFAULT_COLLAPSED_SECTIONS: GraphViewCollapsedSections = {
  "collapse-filter": true,
  "collapse-color-groups": true,
  "collapse-display": true,
  "collapse-forces": true,
};

/** Create the controller's initial state using the recovered defaults. */
export function createGraphViewControllerState(
  options: GraphViewOptionsPatch = {},
  meta: GraphViewOptionsSnapshotMeta = {},
): GraphViewControllerState {
  return {
    options: cloneGraphViewOptions(options),
    scale: meta.scale ?? 1,
    close: meta.close ?? false,
    collapsed: {
      ...DEFAULT_COLLAPSED_SECTIONS,
      ...(meta.collapsed ?? {}),
    },
  };
}

/** Return the exact flat shape persisted by the original controller. */
export function getGraphViewControllerOptions(
  state: GraphViewControllerState,
): GraphViewOptionsSnapshot {
  return graphViewOptionsSnapshot(state.options, {
    scale: state.scale,
    close: state.close,
    collapsed: state.collapsed,
  });
}

/**
 * Apply a persisted flat snapshot without changing omitted values.
 *
 * Two deliberately asymmetric details match the observed controller:
 * `scale` is applied only when truthy, and `close: false` does not reopen a
 * previously closed panel. The UI's explicit open/close actions should use
 * `setGraphViewControllerClosed` below instead of relying on this legacy
 * persistence method.
 */
export function setGraphViewControllerOptions(
  state: GraphViewControllerState,
  snapshot: Partial<GraphViewOptionsSnapshot> | null | undefined,
): GraphViewControllerState {
  if (!snapshot) return cloneGraphViewControllerState(state);

  const current = getGraphViewControllerOptions(state);
  const nextSnapshot = { ...current, ...snapshot };
  const next: GraphViewControllerState = {
    options: graphViewOptionsFromSnapshot(nextSnapshot),
    scale: snapshot.scale ? snapshot.scale : state.scale,
    close: snapshot.close ? snapshot.close : state.close,
    collapsed: {
      "collapse-filter": snapshot["collapse-filter"] ?? state.collapsed["collapse-filter"],
      "collapse-color-groups":
        snapshot["collapse-color-groups"] ?? state.collapsed["collapse-color-groups"],
      "collapse-display": snapshot["collapse-display"] ?? state.collapsed["collapse-display"],
      "collapse-forces": snapshot["collapse-forces"] ?? state.collapsed["collapse-forces"],
    },
  };
  return next;
}

/** Apply a host-side option patch while preserving controller metadata. */
export function patchGraphViewControllerState(
  state: GraphViewControllerState,
  patch: GraphViewOptionsPatch,
): GraphViewControllerState {
  return {
    ...cloneGraphViewControllerState(state),
    options: cloneGraphViewOptions({
      ...state.options,
      ...patch,
      filters: { ...state.options.filters, ...(patch.filters ?? {}) },
      display: { ...state.options.display, ...(patch.display ?? {}) },
      forces: { ...state.options.forces, ...(patch.forces ?? {}) },
      colorGroups: patch.colorGroups ?? state.options.colorGroups,
    }),
  };
}

/** Explicitly open or close the settings surface. */
export function setGraphViewControllerClosed(
  state: GraphViewControllerState,
  close: boolean,
): GraphViewControllerState {
  return { ...cloneGraphViewControllerState(state), close };
}

/** Explicitly set a zoom value; this is separate from legacy snapshot apply. */
export function setGraphViewControllerScale(
  state: GraphViewControllerState,
  scale: number,
): GraphViewControllerState {
  return {
    ...cloneGraphViewControllerState(state),
    scale: Number.isFinite(scale) && scale > 0 ? scale : state.scale,
  };
}

/** Reset settings and section state, preserving the controller object shape. */
export function resetGraphViewControllerState(): GraphViewControllerState {
  return createGraphViewControllerState(DEFAULT_GRAPH_VIEW_OPTIONS, {
    scale: 1,
    close: false,
    collapsed: DEFAULT_COLLAPSED_SECTIONS,
  });
}

function cloneGraphViewControllerState(state: GraphViewControllerState): GraphViewControllerState {
  return {
    options: cloneGraphViewOptions(state.options),
    scale: state.scale,
    close: state.close,
    collapsed: { ...state.collapsed },
  };
}
