import type { GraphViewWorkerNode } from "./types";

type GraphViewLegacyNodeTuple = readonly [x: number, y: number] | null | undefined;

export type GraphViewLegacyNodeTable = Readonly<Record<string, GraphViewLegacyNodeTuple>>;

export type GraphViewLegacyWorkerMessage = {
  readonly nodes?: GraphViewLegacyNodeTable;
  readonly links?: readonly (readonly [source: string, target: string])[];
  readonly forceNode?: {
    readonly id: string;
    readonly x: number | null;
    readonly y: number | null;
  };
  readonly forces?: Partial<{
    readonly centerStrength: number;
    readonly linkStrength: number;
    readonly linkDistance: number;
    readonly repelStrength: number;
  }>;
  readonly alpha?: number;
  readonly alphaTarget?: number;
  /** Presence, rather than truthiness, triggers the source scheduler. */
  readonly run?: boolean;
};

export type GraphViewLegacyWorkerNode = GraphViewWorkerNode & { index: number };

export type GraphViewLegacyNodeTableUpdate = {
  readonly nodesById: ReadonlyMap<string, GraphViewLegacyWorkerNode>;
  readonly order: readonly string[];
};

export type GraphViewLegacyLink = {
  readonly source: GraphViewLegacyWorkerNode;
  readonly target: GraphViewLegacyWorkerNode;
};

export type GraphViewLegacyForceState = {
  readonly centerStrength: number;
  readonly linkStrength: number;
  readonly linkDistance: number;
  readonly repelStrength: number;
};

export type GraphViewLegacyAlphaState = {
  readonly alpha: number;
  readonly alphaTarget: number;
  readonly shouldSchedule: boolean;
};

const hasOwn = (value: object, key: PropertyKey): boolean => Object.hasOwn(value, key);

function makeNode(id: string): GraphViewLegacyWorkerNode {
  return {
    id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    fx: null,
    fy: null,
    index: 0,
  };
}

/**
 * Replays the original object-table update without depending on object
 * property mutation. Existing nodes keep identity and order; removed nodes
 * disappear; new keys append in the source table's enumeration order.
 */
export function reconcileGraphViewLegacyNodeTable(
  previous: ReadonlyMap<string, GraphViewLegacyWorkerNode>,
  incoming: GraphViewLegacyNodeTable,
): GraphViewLegacyNodeTableUpdate {
  const nodesById = new Map(previous);
  const order: string[] = [];

  for (const id of previous.keys()) {
    if (hasOwn(incoming, id)) order.push(id);
    else nodesById.delete(id);
  }

  for (const id of Object.keys(incoming)) {
    let node = nodesById.get(id);
    if (!node) {
      node = makeNode(id);
      nodesById.set(id, node);
      order.push(id);
    }
    const tuple = incoming[id];
    if (tuple) {
      node.x = tuple[0];
      node.y = tuple[1];
    }
  }

  order.forEach((id, index) => {
    const node = nodesById.get(id);
    if (node) node.index = index;
  });

  return { nodesById, order };
}

export function resolveGraphViewLegacyLinks(
  links: readonly (readonly [source: string, target: string])[],
  nodesById: ReadonlyMap<string, GraphViewLegacyWorkerNode>,
): readonly GraphViewLegacyLink[] {
  const resolved: GraphViewLegacyLink[] = [];
  for (const [sourceId, targetId] of links) {
    const source = nodesById.get(sourceId);
    const target = nodesById.get(targetId);
    if (source && target) resolved.push({ source, target });
  }
  return resolved;
}

export function applyGraphViewLegacyForcePatch(
  previous: GraphViewLegacyForceState,
  patch: GraphViewLegacyWorkerMessage["forces"],
): GraphViewLegacyForceState {
  if (!patch) return previous;
  const repelStrength = patch.repelStrength;
  return {
    centerStrength:
      patch.centerStrength === undefined ? previous.centerStrength : patch.centerStrength,
    linkStrength: patch.linkStrength === undefined ? previous.linkStrength : patch.linkStrength,
    linkDistance: patch.linkDistance === undefined ? previous.linkDistance : patch.linkDistance,
    repelStrength:
      repelStrength === undefined
        ? previous.repelStrength
        : Math.abs(repelStrength) < 1
          ? -1
          : -repelStrength,
  };
}

export function advanceGraphViewLegacyAlpha(
  previous: GraphViewLegacyAlphaState,
  message: Pick<GraphViewLegacyWorkerMessage, "alpha" | "alphaTarget" | "run">,
): GraphViewLegacyAlphaState {
  return {
    alpha: message.alpha === undefined ? previous.alpha : Math.max(previous.alpha, message.alpha),
    alphaTarget: message.alphaTarget === undefined ? previous.alphaTarget : message.alphaTarget,
    shouldSchedule: message.run === undefined ? previous.shouldSchedule : true,
  };
}

export function applyGraphViewLegacyForceNode(
  node: GraphViewLegacyWorkerNode | undefined,
  forceNode: GraphViewLegacyWorkerMessage["forceNode"],
): void {
  if (!node || !forceNode || node.id !== forceNode.id) return;
  node.fx = forceNode.x;
  node.fy = forceNode.y;
}

export function graphViewLegacySharedFrameBytes(nodeCount: number): number {
  return Math.max(0, Math.floor(nodeCount)) * 2 * Float32Array.BYTES_PER_ELEMENT + 4;
}
