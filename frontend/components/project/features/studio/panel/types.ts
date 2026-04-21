import type { HTMLAttributes } from "react";
import type { ArtifactHistoryItem } from "@/lib/project-space/artifact-history";
import type {
  StudioCardCapability,
  StudioCardExecutionPlan,
} from "@/lib/sdk/studio-cards";
import type { CapabilityResolution } from "../tools/capability-resolver";
import type { StudioTool } from "../constants";
import type { StudioHistoryStatus } from "../history/types";
import type { ManagedResultTarget, StudioToolKey, ToolDraftState } from "../tools";

export interface StudioPanelProps extends HTMLAttributes<HTMLDivElement> {
  onToolClick?: (tool: StudioTool) => void;
  onPptStep2LayoutChange?: (isStep2: boolean) => void;
}

export interface StudioExecutionResult {
  ok: boolean;
  sessionId: string | null;
  effectiveSessionId: string | null;
  resourceKind: string | null;
  runId: string | null;
  runNo: number | null;
  artifactId?: string | null;
  status?: StudioHistoryStatus | null;
  recovered?: boolean;
}

export type StudioSourceOption = {
  id: string;
  title?: string;
  type?: string;
  sessionId?: string | null;
};

export type ToolDraftsState = Partial<Record<StudioToolKey, ToolDraftState>>;

export type CapabilityStateByCardId = Record<
  string,
  CapabilityResolution & { isLoading: boolean }
>;

export type SourceOptionsByCard = Record<string, StudioSourceOption[]>;
export type SelectedSourceByCard = Record<string, string | null>;

export type CardCapabilityMap = Record<string, StudioCardCapability>;
export type ExecutionPlanMap = Record<string, StudioCardExecutionPlan>;

export type RuntimeArtifactsByTool = Partial<
  Record<StudioToolKey, ArtifactHistoryItem[]>
>;

export interface ManagedDraftAnchor {
  sessionId: string | null;
  artifactId: string | null;
  runId: string | null;
  status: StudioHistoryStatus | null;
  pendingWorkflowId?: string | null;
}

export interface ManagedWorkbenchState {
  mode: "draft" | "history";
  target: ManagedResultTarget | null;
  draftAnchors: Partial<Record<StudioToolKey, ManagedDraftAnchor>>;
}
