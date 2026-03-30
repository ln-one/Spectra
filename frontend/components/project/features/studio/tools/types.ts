export type StudioToolKey =
  | "word"
  | "mindmap"
  | "outline"
  | "quiz"
  | "summary"
  | "animation"
  | "handout";

export type CapabilityStatus =
  | "backend_ready"
  | "backend_placeholder"
  | "backend_not_implemented"
  | "backend_error";

export type ResolvedArtifactContentKind =
  | "none"
  | "json"
  | "text"
  | "media"
  | "binary";

export interface ResolvedArtifactPayload {
  artifactId: string;
  artifactType?: string;
  contentKind: ResolvedArtifactContentKind;
  content: unknown;
  blob?: Blob;
}

export type ToolDraftValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[];

export type ToolDraftState = Record<string, ToolDraftValue>;

export interface ToolSourceOption {
  id: string;
  title?: string;
  type?: string;
  sessionId?: string | null;
}

export interface ToolArtifactPreviewItem {
  artifactId: string;
  title: string;
  status: "completed" | "failed" | "processing" | "pending";
  createdAt: string;
}

export interface ToolFlowContext {
  readiness?: string | null;
  isLoadingProtocol?: boolean;
  isActionRunning?: boolean;
  isProtocolPending?: boolean;
  requiresSourceArtifact?: boolean;
  supportsChatRefine?: boolean;
  canExecute?: boolean;
  canRefine?: boolean;
  capabilityStatus?: CapabilityStatus;
  capabilityReason?: string;
  isCapabilityLoading?: boolean;
  resolvedArtifact?: ResolvedArtifactPayload | null;
  sourceOptions?: ToolSourceOption[];
  selectedSourceId?: string | null;
  requestedStep?: string | null;
  latestArtifacts?: ToolArtifactPreviewItem[];
  onStepChange?: (stepId: string) => void;
  onSelectedSourceChange?: (sourceId: string | null) => void;
  onLoadSources?: () => Promise<void> | void;
  onPreviewExecution?: () => Promise<void> | void;
  onExecute?: () => Promise<boolean> | boolean;
  onRefine?: () => Promise<void> | void;
  onExportArtifact?: (artifactId: string) => Promise<void> | void;
}

export interface ToolPanelProps {
  toolId: StudioToolKey;
  toolName: string;
  onDraftChange?: (draft: ToolDraftState) => void;
  flowContext?: ToolFlowContext;
}
