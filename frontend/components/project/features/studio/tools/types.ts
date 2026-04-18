import type {
  StudioCardCapability,
  StudioCardTurnResponseData,
  StudioCardTurnResult,
} from "@/lib/sdk/studio-cards";

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
  | "missing_requirements"
  | "protocol_limited"
  | "executing"
  | "refining"
  | "continuing"
  | "backend_not_implemented"
  | "backend_error";

export type StudioWorkflowState =
  | "idle"
  | "missing_requirements"
  | "ready_to_execute"
  | "executing"
  | "result_available"
  | "refining"
  | "continuing"
  | "failed";

export interface StudioGovernanceRubric {
  protocol_ready: boolean;
  surface_ready: boolean;
  execute_ready: boolean;
  refine_ready: boolean;
  source_binding_ready: boolean;
  authority_boundary_risk: "low" | "medium" | "high";
}

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

export interface ToolDisplayModel {
  toolId: StudioToolKey;
  productTitle: string;
  productDescription: string;
  studioCardId?: string;
  actionLabels: {
    preview: string;
    loadSources: string;
    execute: string;
    refine: string;
  };
  sourceBinding: {
    required: string;
    optional: string;
    empty: string;
  };
}

export interface ToolFlowContext {
  display?: ToolDisplayModel;
  cardCapability?: StudioCardCapability | null;
  readiness?: string | null;
  workflowState?: StudioWorkflowState;
  governanceRubric?: StudioGovernanceRubric | null;
  isLoadingProtocol?: boolean;
  isActionRunning?: boolean;
  isProtocolPending?: boolean;
  requiresSourceArtifact?: boolean;
  supportsChatRefine?: boolean;
  canExecute?: boolean;
  canRefine?: boolean;
  canFollowUpTurn?: boolean;
  canRecommendPlacement?: boolean;
  canConfirmPlacement?: boolean;
  followUpTurnLabel?: string;
  capabilityStatus?: CapabilityStatus;
  capabilityReason?: string;
  isCapabilityLoading?: boolean;
  resolvedArtifact?: ResolvedArtifactPayload | null;
  sourceOptions?: ToolSourceOption[];
  selectedSourceId?: string | null;
  requestedStep?: string | null;
  latestArtifacts?: ToolArtifactPreviewItem[];
  latestRunnableState?: Record<string, unknown> | null;
  provenance?: Record<string, unknown> | null;
  sourceBinding?: Record<string, unknown> | null;
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
  onFollowUpTurn?: (payload: {
    artifactId: string;
    teacherAnswer: string;
    turnAnchor?: string;
    config?: Record<string, unknown>;
  }) => Promise<{
    ok: boolean;
    artifactId?: string | null;
    effectiveSessionId?: string | null;
    turnResult?: StudioCardTurnResult | null;
    latestRunnableState?: Record<string, unknown> | null;
    nextFocus?: string | null;
    turnAnchor?: string | null;
    raw?: StudioCardTurnResponseData | null;
  }>;
  onStructuredRefine?: (payload: {
    artifactId: string;
    message?: string;
    refineMode?: "chat_refine" | "structured_refine" | "follow_up_turn";
    selectionAnchor?: Record<string, unknown>;
    config?: Record<string, unknown>;
  }) => Promise<boolean> | boolean;
  onStructuredRefineArtifact?: (payload: {
    artifactId: string;
    message: string;
    refineMode?: "chat_refine" | "structured_refine" | "follow_up_turn";
    selectionAnchor?: Record<string, unknown>;
    config?: Record<string, unknown>;
  }) => Promise<{
    ok: boolean;
    artifactId?: string | null;
    effectiveSessionId?: string | null;
    insertedNodeId?: string | null;
  }>;
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
