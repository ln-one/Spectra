import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import type { StudioHistoryStatus } from "../history/types";
import type { StudioToolKey } from "../tools";

export function shouldForcePreviewChatStep(params: {
  toolType: StudioToolKey | null;
  isWordHistoryMode: boolean;
  isManagedHistoryMode: boolean;
  expandedTool: GenerationToolType | null;
  resolvedArtifactId: string | null;
  managedTargetArtifactId: string | null;
  managedTargetStatus: StudioHistoryStatus | null | undefined;
}): boolean {
  const {
    toolType,
    isWordHistoryMode,
    isManagedHistoryMode,
    expandedTool,
    resolvedArtifactId,
    managedTargetArtifactId,
    managedTargetStatus,
  } = params;
  if (toolType === "word") {
    return (
      isWordHistoryMode ||
      Boolean(resolvedArtifactId) ||
      Boolean(managedTargetArtifactId) ||
      managedTargetStatus === "processing" ||
      managedTargetStatus === "previewing" ||
      managedTargetStatus === "completed"
    );
  }
  if (toolType === "mindmap") {
    return (
      (expandedTool === "mindmap" && isManagedHistoryMode) ||
      Boolean(resolvedArtifactId) ||
      Boolean(managedTargetArtifactId) ||
      managedTargetStatus === "processing"
    );
  }
  return false;
}
