import type { ArtifactHistoryItem } from "@/lib/project-space/artifact-history";
import type { ManagedResolvedTarget, ManagedResultTarget, StudioToolKey } from "../tools";
import type { ManagedWorkbenchState } from "./types";

const MANAGED_LIFECYCLE_TOOLS = new Set<StudioToolKey>([
  "word",
  "mindmap",
  "quiz",
]);

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeTargetStatus(
  value: unknown
): ManagedResolvedTarget["status"] {
  if (
    value === "pending" ||
    value === "draft" ||
    value === "processing" ||
    value === "previewing" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }
  return null;
}

function findArtifactByIdentity(
  artifacts: ArtifactHistoryItem[],
  toolType: StudioToolKey,
  sessionId: string | null,
  artifactId: string | null,
  runId: string | null
): ArtifactHistoryItem | null {
  const scopedArtifacts = artifacts.filter(
    (item) =>
      item.toolType === toolType &&
      (!sessionId || item.sessionId === sessionId)
  );
  if (artifactId) {
    return scopedArtifacts.find((item) => item.artifactId === artifactId) ?? null;
  }
  if (runId) {
    return scopedArtifacts.find((item) => item.runId === runId) ?? null;
  }
  return null;
}

function resolveHistoryTarget(
  toolType: StudioToolKey,
  target: ManagedResultTarget | null,
  activeSessionId: string | null,
  currentToolArtifacts: ArtifactHistoryItem[]
): ManagedResolvedTarget | null {
  if (!target || target.toolType !== toolType) return null;
  const kind = target.kind ?? (target.artifactId ? "pinned_artifact" : "pinned_run");
  const matchedArtifact = findArtifactByIdentity(
    currentToolArtifacts,
    toolType,
    target.sessionId ?? null,
    target.artifactId ?? null,
    kind === "pinned_run" ? target.runId ?? null : null
  );
  return {
    kind,
    toolType,
    sessionId: target.sessionId ?? matchedArtifact?.sessionId ?? activeSessionId,
    artifactId: target.artifactId ?? matchedArtifact?.artifactId ?? null,
    runId:
      kind === "pinned_run"
        ? target.runId ?? matchedArtifact?.runId ?? null
        : null,
    status: normalizeTargetStatus(target.status ?? matchedArtifact?.status ?? null),
    isHistorical: true,
  };
}

export function isManagedLifecycleTool(toolType: StudioToolKey | null | undefined): boolean {
  return Boolean(toolType && MANAGED_LIFECYCLE_TOOLS.has(toolType));
}

export function resolveManagedTarget(params: {
  toolType: StudioToolKey | null;
  managedWorkbenchState: ManagedWorkbenchState | null | undefined;
  activeSessionId: string | null;
  activeRunId: string | null;
  currentToolArtifacts: ArtifactHistoryItem[];
}): ManagedResolvedTarget | null {
  const {
    toolType,
    managedWorkbenchState,
    activeSessionId,
    activeRunId,
    currentToolArtifacts,
  } = params;
  if (!toolType) return null;

  if (managedWorkbenchState?.mode === "history") {
    return resolveHistoryTarget(
      toolType,
      managedWorkbenchState.target,
      activeSessionId,
      currentToolArtifacts
    );
  }

  if (!isManagedLifecycleTool(toolType)) {
    const normalizedRunId = readTrimmedString(activeRunId);
    const matchedArtifact = normalizedRunId
      ? currentToolArtifacts.find((item) => item.runId === normalizedRunId) ?? null
      : currentToolArtifacts[0] ?? null;
    if (!matchedArtifact && !normalizedRunId) {
      return {
        kind: "draft",
        toolType,
        sessionId: activeSessionId,
        artifactId: null,
        runId: null,
        status: null,
        isHistorical: false,
      };
    }
    return {
      kind: normalizedRunId ? "pinned_run" : "draft",
      toolType,
      sessionId: matchedArtifact?.sessionId ?? activeSessionId,
      artifactId: matchedArtifact?.artifactId ?? null,
      runId: normalizedRunId ?? matchedArtifact?.runId ?? null,
      status: normalizeTargetStatus(matchedArtifact?.status ?? null),
      isHistorical: false,
    };
  }

  const draftAnchor = managedWorkbenchState?.draftAnchors?.[toolType] ?? null;
  const matchedArtifact = findArtifactByIdentity(
    currentToolArtifacts,
    toolType,
    draftAnchor?.sessionId ?? activeSessionId,
    draftAnchor?.artifactId ?? null,
    null
  );
  return {
    kind: "draft",
    toolType,
    sessionId:
      draftAnchor?.sessionId ?? matchedArtifact?.sessionId ?? activeSessionId,
    artifactId: draftAnchor?.artifactId ?? matchedArtifact?.artifactId ?? null,
    runId: draftAnchor?.runId ?? matchedArtifact?.runId ?? null,
    status: normalizeTargetStatus(
      draftAnchor?.status ?? matchedArtifact?.status ?? null
    ),
    isHistorical: false,
  };
}

export function doesArtifactMatchResolvedTarget(
  artifact: Pick<ArtifactHistoryItem, "toolType" | "artifactId" | "sessionId" | "runId">,
  target: ManagedResolvedTarget | null | undefined
): boolean {
  if (!target) return false;
  if (artifact.toolType !== target.toolType) return false;
  if (target.artifactId) {
    return artifact.artifactId === target.artifactId;
  }
  if (target.kind === "pinned_run" && target.runId && target.sessionId) {
    return artifact.runId === target.runId && artifact.sessionId === target.sessionId;
  }
  return false;
}
