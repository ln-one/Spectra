import type { GraphViewColorGroup } from "./options";

const GRAPH_VIEW_GROUP_DRAG_THRESHOLD_SQUARED = 25;

export type GraphViewGroupRow = {
  top: number;
  height: number;
};

/** Match the color helper used when the original controller creates a group. */
export function graphViewHslToRgb(hue: number, saturation: number, lightness: number): number {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = Math.min(100, Math.max(0, saturation)) / 100;
  const l = Math.min(100, Math.max(0, lightness)) / 100;
  const hueToRgb = (p: number, q: number, t: number): number => {
    let normalized = t;
    if (normalized < 0) normalized += 1;
    if (normalized > 1) normalized -= 1;
    if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
    if (normalized < 1 / 2) return q;
    if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
    return p;
  };

  if (s === 0) {
    const channel = Math.round(l * 255);
    return (channel << 16) | (channel << 8) | channel;
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const red = Math.round(hueToRgb(p, q, h + 1 / 3) * 255);
  const green = Math.round(hueToRgb(p, q, h) * 255);
  const blue = Math.round(hueToRgb(p, q, h - 1 / 3) * 255);
  return (red << 16) | (green << 8) | blue;
}

/**
 * Create the next group color using the recovered 40° hue spacing. The
 * lightness branch mirrors the application's dark/light theme choice.
 */
export function createGraphViewColorGroup(
  index: number,
  darkMode: boolean,
  query = "",
): GraphViewColorGroup {
  return {
    query,
    color: {
      a: 1,
      rgb: graphViewHslToRgb(index * 40, darkMode ? 70 : 60, 60),
    },
  };
}

/** The settings panel starts a reorder only after the pointer moved 5px. */
export function exceededColorGroupDragThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): boolean {
  const dx = currentX - startX;
  const dy = currentY - startY;
  return dx * dx + dy * dy > GRAPH_VIEW_GROUP_DRAG_THRESHOLD_SQUARED;
}

/** Match the original midpoint-based drop target calculation. */
export function colorGroupDropIndex(rows: readonly GraphViewGroupRow[], pointerY: number): number {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row && pointerY < row.top + row.height / 2) return index;
  }
  return rows.length;
}

/** Reorder an immutable group list without changing query or color values. */
export function reorderColorGroups(
  groups: readonly GraphViewColorGroup[],
  fromIndex: number,
  toIndex: number,
): GraphViewColorGroup[] {
  if (groups.length === 0) return [];
  if (fromIndex < 0 || fromIndex >= groups.length) return groups.map(cloneGroup);

  const next = groups.map(cloneGroup);
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return next;
  const insertionIndex = Math.min(next.length, Math.max(0, Math.round(toIndex)));
  next.splice(insertionIndex, 0, moved);
  return next;
}

function cloneGroup(group: GraphViewColorGroup): GraphViewColorGroup {
  return { query: group.query, color: { ...group.color } };
}
