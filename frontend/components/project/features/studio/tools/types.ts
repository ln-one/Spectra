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
  artifactMetadata?: Record<string, unknown> | null;
}

export interface ToolStructuredRefineRequest {
  artifactId: string;
  message: string;
  config?: Record<string, unknown>;
}

export interface ToolStructuredRefineResult {
  ok: boolean;
  artifactId?: string | null;
  effectiveSessionId?: string | null;
  insertedNodeId?: string | null;
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
  projectId?: string;
  title?: string;
  type?: string;
  sessionId?: string | null;
}

export interface ToolArtifactPreviewItem {
  artifactId: string;
  title: string;
  status: "completed" | "failed" | "processing" | "pending";
  createdAt: string;
  sourceArtifactId?: string | null;
  runId?: string | null;
  runNo?: number | null;
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
  cardConfigFields?: Array<Record<string, unknown>>;
  onStepChange?: (stepId: string) => void;
  onSelectedSourceChange?: (sourceId: string | null) => void;
  onLoadSources?: () => Promise<void> | void;
  onPreviewExecution?: () =>
    | Promise<Record<string, unknown> | null>
    | Record<string, unknown>
    | null;
  onPrepareGenerate?: () => Promise<boolean> | boolean;
  onExecute?: () => Promise<boolean> | boolean;
  onRefine?: () => Promise<void> | void;
  onStructuredRefine?: (payload: {
    artifactId: string;
    message?: string;
    config?: Record<string, unknown>;
  }) => Promise<boolean> | boolean;
  onStructuredRefineArtifact?: (
    payload: ToolStructuredRefineRequest
  ) => Promise<ToolStructuredRefineResult>;
  onRecommendAnimationPlacement?: (payload: {
    artifactId: string;
    pptArtifactId: string;
  }) =>
    | Promise<Record<string, unknown> | null>
    | Record<string, unknown>
    | null;
  onConfirmAnimationPlacement?: (payload: {
    artifactId: string;
    pptArtifactId: string;
    pageNumbers: number[];
    slot: string;
  }) =>
    | Promise<Record<string, unknown> | null>
    | Record<string, unknown>
    | null;
  onExportArtifact?: (artifactId: string) => Promise<void> | void;
}

export interface ToolPanelProps {
  toolId: StudioToolKey;
  toolName: string;
  onDraftChange?: (draft: ToolDraftState) => void;
  flowContext?: ToolFlowContext;
}
