import type { StudioManagedTool } from "@/stores/project-store/types";
import type {
  ArtifactHistoryItem,
  GenerationToolType,
} from "@/lib/project-space/artifact-history";
import type { StudioHistoryStep } from "../history/types";
import type { StudioToolKey, ToolDraftState } from "../tools";
import { STUDIO_RUNTIME_ARTIFACTS_STORAGE_PREFIX } from "./constants";

export function isDraftStateEqual(
  left: ToolDraftState | undefined,
  right: ToolDraftState
): boolean {
  if (!left) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return rightKeys.every((key) => {
    const lv = left[key];
    const rv = right[key];
    if (Array.isArray(lv) && Array.isArray(rv)) {
      if (lv.length !== rv.length) return false;
      return lv.every((item, idx) => item === rv[idx]);
    }
    return lv === rv;
  });
}

export function normalizeHistoryStep(
  stepId: string | null | undefined
): StudioHistoryStep {
  if (
    stepId === "config" ||
    stepId === "generate" ||
    stepId === "preview" ||
    stepId === "outline"
  ) {
    return stepId;
  }
  return "config";
}

export function isPptStep2Stage(
  stage: "config" | "generating_outline" | "outline" | "preview"
): boolean {
  return stage === "generating_outline" || stage === "outline";
}

export function toStudioManagedTool(
  toolType: GenerationToolType
): StudioManagedTool | null {
  if (toolType === "ppt") return null;
  return toolType as StudioManagedTool;
}

export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function buildRuntimeArtifactStorageKey(
  projectId: string | null | undefined,
  sessionId: string | null | undefined
): string | null {
  if (!projectId || !sessionId) return null;
  return `${STUDIO_RUNTIME_ARTIFACTS_STORAGE_PREFIX}:${projectId}:${sessionId}`;
}

export function mergeToolArtifacts(
  tool: StudioToolKey,
  fromStore: ArtifactHistoryItem[],
  runtimeMap: Partial<Record<StudioToolKey, ArtifactHistoryItem[]>>
): ArtifactHistoryItem[] {
  const fromRuntime = runtimeMap[tool] ?? [];
  if (fromRuntime.length === 0) {
    return fromStore;
  }
  const mergedById = new Map<string, ArtifactHistoryItem>();
  for (const item of [...fromStore, ...fromRuntime]) {
    if (!mergedById.has(item.artifactId)) {
      mergedById.set(item.artifactId, item);
    }
  }
  return [...mergedById.values()].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}
