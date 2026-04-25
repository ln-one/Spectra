import type { GenerationToolType } from "@/lib/project-space/artifact-history";

export type StudioHistoryStatus =
  | "draft"
  | "processing"
  | "previewing"
  | "completed"
  | "failed"
  | "pending";

export type StudioPptHistoryStatus =
  | "outline_generating"
  | "outline_pending_confirm"
  | "slides_generating"
  | "slide_preview_ready";

export type StudioHistoryStep = "config" | "generate" | "preview" | "outline";

export interface StudioHistoryItem {
  id: string;
  origin: "workflow" | "artifact";
  workflowId?: string | null;
  toolType: GenerationToolType;
  title: string;
  status: StudioHistoryStatus;
  createdAt: string;
  sessionId: string | null;
  step: StudioHistoryStep;
  artifactId?: string;
  replacesArtifactId?: string | null;
  supersededByArtifactId?: string | null;
  isCurrent?: boolean | null;
  runId?: string | null;
  runNo?: number | null;
  ppt_status?: StudioPptHistoryStatus;
}
