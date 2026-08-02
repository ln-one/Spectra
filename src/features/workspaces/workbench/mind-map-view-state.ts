import { z } from "zod";
import type { MindMapContent } from "@/features/artifacts/mind-maps/contract";
import { createInitialMindMapCollapsedIds } from "@/features/artifacts/mind-maps/layout";

const mindMapViewStateSchema = z
  .object({
    collapsedIds: z.array(z.string()),
    focusRootId: z.string().nullable(),
    mode: z.enum(["canvas", "outline"]),
  })
  .strict();

export type MindMapViewState = z.infer<typeof mindMapViewStateSchema>;

export function emptyMindMapViewState(): MindMapViewState {
  return { collapsedIds: [], focusRootId: null, mode: "canvas" };
}

function defaultMindMapViewState(content: MindMapContent): MindMapViewState {
  return {
    collapsedIds: [...createInitialMindMapCollapsedIds({ content })],
    focusRootId: null,
    mode: "canvas",
  };
}

export function readMindMapViewState(
  content: MindMapContent,
  storageKey: string | null,
): MindMapViewState {
  const fallback = defaultMindMapViewState(content);
  if (!storageKey || typeof globalThis.localStorage?.getItem !== "function") return fallback;
  try {
    const stored = globalThis.localStorage.getItem(storageKey);
    const parsed = stored ? mindMapViewStateSchema.safeParse(JSON.parse(stored)) : null;
    if (!parsed?.success) return fallback;
    return reconcileMindMapViewState(parsed.data, content);
  } catch {
    return fallback;
  }
}

export function reconcileMindMapViewState(
  current: MindMapViewState,
  content: MindMapContent,
): MindMapViewState {
  const validIds = new Set(content.nodes.map((node) => node.id));
  return {
    collapsedIds: current.collapsedIds.filter((id) => validIds.has(id)),
    focusRootId:
      current.focusRootId && validIds.has(current.focusRootId) ? current.focusRootId : null,
    mode: current.mode,
  };
}

export function mindMapViewStorageKey(artifactId: string, revisionId: string) {
  return `spectra:mind-map-view:v1:${artifactId}:${revisionId}`;
}

export function persistMindMapViewState(storageKey: string, viewState: MindMapViewState) {
  if (typeof globalThis.localStorage?.setItem !== "function") return;
  try {
    globalThis.localStorage.setItem(storageKey, JSON.stringify(viewState));
  } catch {
    // View preferences remain available in memory when browser storage is unavailable.
  }
}
