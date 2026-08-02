import type { ArtifactDetail } from "@/features/artifacts/contract";
import type {
  ArtifactGenerationState,
  ArtifactHistoryItem,
  ArtifactKind,
} from "@/features/artifacts/types";
import { artifactGenerationStateRank } from "@/features/artifacts/types";
import type { StudioToolId } from "./studioTools";

export type ArtifactCreationToolId =
  | "smart-slides"
  | "teaching-document"
  | "mind-map"
  | "quiz"
  | "interactive-game"
  | "animation";

export type ArtifactSelectionState =
  | { mode: "studio"; waitingForUrl: boolean }
  | { mode: "starting"; toolId: ArtifactCreationToolId }
  | { mode: "selected"; artifactId: string }
  | { mode: "unavailable"; artifactId: string };

export type ArtifactSelectionAction =
  | { type: "openStudio" }
  | { type: "start"; toolId: ArtifactCreationToolId }
  | { type: "select"; artifactId: string }
  | { type: "unavailable"; artifactId: string }
  | { type: "urlChanged"; artifactId: string | null };

export const initialArtifactSelectionState: ArtifactSelectionState = {
  mode: "studio",
  waitingForUrl: false,
};

export type ArtifactWorkspacePhase = "idle" | "generating" | "finalizing" | "ready" | "failed";

export type ArtifactWorkbenchLayoutMode = "compose" | "preview";

function isArtifactCreationToolId(toolId: StudioToolId): toolId is ArtifactCreationToolId {
  return (
    toolId === "smart-slides" ||
    toolId === "teaching-document" ||
    toolId === "mind-map" ||
    toolId === "quiz" ||
    toolId === "interactive-game" ||
    toolId === "animation"
  );
}

export function artifactSelectionReducer(
  state: ArtifactSelectionState,
  action: ArtifactSelectionAction,
): ArtifactSelectionState {
  switch (action.type) {
    case "openStudio":
      return { mode: "studio", waitingForUrl: true };
    case "start":
      return { mode: "starting", toolId: action.toolId };
    case "select":
      return { mode: "selected", artifactId: action.artifactId };
    case "unavailable":
      return { mode: "unavailable", artifactId: action.artifactId };
    case "urlChanged":
      if (state.mode === "selected" && state.artifactId === action.artifactId) {
        return initialArtifactSelectionState;
      }
      if (state.mode === "studio" && state.waitingForUrl && action.artifactId === null) {
        return initialArtifactSelectionState;
      }
      if (state.mode === "unavailable" && state.artifactId !== action.artifactId) {
        return initialArtifactSelectionState;
      }
      return state;
  }
}

export function artifactSelectionForTool(
  toolId: StudioToolId,
): Extract<ArtifactSelectionState, { mode: "starting" }> | null {
  return isArtifactCreationToolId(toolId) ? { mode: "starting", toolId } : null;
}

export function artifactKindForSelection(selection: ArtifactSelectionState): ArtifactKind | null {
  if (selection.mode !== "starting") return null;
  switch (selection.toolId) {
    case "smart-slides":
      return "presentation";
    case "teaching-document":
      return "teaching_document";
    case "mind-map":
      return "mind_map";
    case "quiz":
      return "quiz";
    case "interactive-game":
      return "game";
    case "animation":
      return "animation";
  }
}

export function selectedArtifactIdForState(
  state: ArtifactSelectionState,
  urlArtifactId: string | null,
) {
  if (state.mode === "selected") return state.artifactId;
  if (state.mode === "studio" && !state.waitingForUrl) return urlArtifactId;
  return null;
}

export function isArtifactCreationToolAvailable(toolId: StudioToolId) {
  return isArtifactCreationToolId(toolId);
}

export function studioToolForArtifactKind(kind: ArtifactKind): StudioToolId | null {
  switch (kind) {
    case "presentation":
      return "smart-slides";
    case "teaching_document":
      return "teaching-document";
    case "mind_map":
      return "mind-map";
    case "quiz":
      return "quiz";
    case "game":
      return "interactive-game";
    case "animation":
      return "animation";
  }
}

export function artifactWorkspacePhase(
  generationState: ArtifactGenerationState | undefined,
): ArtifactWorkspacePhase {
  switch (generationState) {
    case undefined:
      return "idle";
    case "queued":
    case "generating":
      return "generating";
    case "finalizing":
    case "ready":
    case "failed":
      return generationState;
    case "cancelled":
      return "failed";
  }
}

export function artifactDetailRefetchInterval(
  detail: ArtifactDetail | undefined,
  now = Date.now(),
) {
  if (
    !detail ||
    detail.generationState === "ready" ||
    detail.generationState === "failed" ||
    detail.generationState === "cancelled"
  ) {
    return false;
  }
  if (detail.generationAttemptId) return 2_000;
  const waitingForClaim = Math.max(0, now - Date.parse(detail.updatedAt));
  if (waitingForClaim < 15_000) return 500;
  if (waitingForClaim < 60_000) return 2_000;
  return 10_000;
}

function selectNewestArtifactDetail(
  cached: ArtifactDetail | undefined,
  server: ArtifactDetail | null,
  selectedArtifactId: string | null,
) {
  if (!server || server.id !== selectedArtifactId) return cached;
  if (!cached || cached.id !== server.id) return server;
  const cachedTime = Date.parse(cached.updatedAt);
  const serverTime = Date.parse(server.updatedAt);
  if (server.generationAttemptId !== cached.generationAttemptId) {
    return serverTime >= cachedTime ? server : cached;
  }
  if (cached.artifact && !server.artifact) return cached;
  if (server.artifact && !cached.artifact) return server;
  if (
    server.artifact &&
    cached.artifact &&
    server.artifact.currentRevision.revisionNumber !==
      cached.artifact.currentRevision.revisionNumber
  ) {
    return server.artifact.currentRevision.revisionNumber >
      cached.artifact.currentRevision.revisionNumber
      ? server
      : cached;
  }
  const serverStateRank = artifactGenerationStateRank(server.generationState);
  const cachedStateRank = artifactGenerationStateRank(cached.generationState);
  if (serverStateRank !== cachedStateRank) {
    return serverStateRank > cachedStateRank ? server : cached;
  }
  if (server.generationSequence !== cached.generationSequence) {
    return server.generationSequence > cached.generationSequence ? server : cached;
  }
  if (serverTime !== cachedTime) return serverTime > cachedTime ? server : cached;
  return cached;
}

export function newestArtifactDetail(
  cached: ArtifactDetail | undefined,
  server: ArtifactDetail | null,
  selectedArtifactId: string | null,
): ArtifactDetail | undefined {
  const selected = selectNewestArtifactDetail(cached, server, selectedArtifactId);
  if (
    !selected ||
    !cached ||
    selected.kind !== "presentation" ||
    cached.kind !== "presentation" ||
    selected.generationAttemptId !== cached.generationAttemptId ||
    !cached.generationDraft?.preview ||
    selected.generationDraft?.preview
  ) {
    return selected;
  }
  if (
    selected.generationState !== "queued" &&
    selected.generationState !== "generating" &&
    selected.generationState !== "finalizing" &&
    selected.generationState !== "failed"
  ) {
    return selected;
  }
  return {
    ...selected,
    generationDraft: {
      ...(selected.generationDraft ?? cached.generationDraft),
      preview: cached.generationDraft.preview,
    },
    generationSequence: Math.max(selected.generationSequence, cached.generationSequence),
  };
}

export function artifactHistoryRefetchInterval(
  history: readonly ArtifactHistoryItem[] | undefined,
  now = Date.now(),
) {
  const active = history?.filter(
    (item) =>
      item.generationState !== "ready" &&
      item.generationState !== "failed" &&
      item.generationState !== "cancelled",
  );
  if (!active?.length) return false;
  const freshestUpdate = Math.max(...active.map((item) => Date.parse(item.updatedAt)));
  const idleFor = Math.max(0, now - freshestUpdate);
  if (idleFor < 15_000) return 1_000;
  if (idleFor < 60_000) return 3_000;
  if (idleFor < 5 * 60_000) return 10_000;
  return 30_000;
}

export function artifactWorkbenchLayoutMode(input: {
  generationState: ArtifactGenerationState | undefined;
  hasRenderableContent: boolean;
}): ArtifactWorkbenchLayoutMode {
  return input.generationState !== undefined && input.generationState !== "failed"
    ? "preview"
    : input.hasRenderableContent
      ? "preview"
      : "compose";
}
