export type AnimationCompileStatus = "pending" | "success" | "error";

export interface AnimationSceneOutlineItem {
  title: string;
  summary?: string;
}

export interface AnimationCompileError {
  message: string;
  line?: number;
  column?: number;
  ruleId?: string;
  source?: "provider" | "schema" | "ast" | "runtime_api" | "sandbox";
}

export interface AnimationValidationReportItem {
  stage: string;
  ruleId?: string;
  message: string;
  line?: number;
  column?: number;
}

export interface AnimationRuntimeDiagnostics {
  finishReason?: string | null;
  hasReasoningContent?: boolean | null;
  rawContentLength?: number | null;
  schemaMode?: string | null;
}

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphTrackItem {
  id: string;
  label: string;
  value: number;
  accent?: "swap" | "active" | "success" | "muted" | null;
  marker?: string | null;
}

export interface GraphEntity {
  id: string;
  kind:
    | "track_stack"
    | "node"
    | "edge"
    | "vector"
    | "path"
    | "axis"
    | "curve"
    | "callout"
    | "caption"
    | "badge";
  title?: string | null;
  body?: string | null;
  text?: string | null;
  label?: string | null;
  accent?: "swap" | "active" | "success" | "muted" | null;
  marker?: string | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  from_x?: number | null;
  from_y?: number | null;
  to_x?: number | null;
  to_y?: number | null;
  items?: GraphTrackItem[] | null;
  max_value?: number | null;
  points?: GraphPoint[] | null;
  focus_weight?: number | null;
  target_ids?: string[] | null;
}

export interface GraphAction {
  kind:
    | "highlight"
    | "swap"
    | "move"
    | "compare"
    | "reveal"
    | "connect"
    | "annotate"
    | "transform_value"
    | "focus"
    | "complete";
  entity_ids: string[];
  note?: string | null;
}

export interface GraphCaptionStream {
  title: string;
  body?: string | null;
  secondary_note?: string | null;
}

export interface GraphStepFrame {
  index: number;
  primary_caption: GraphCaptionStream;
  entities: GraphEntity[];
  actions: GraphAction[];
  focus_targets: string[];
}

export interface GraphScene {
  id: string;
  title: string;
  summary?: string | null;
  emphasis?: string | null;
  start_step: number;
  end_step: number;
  focus_targets: string[];
}

export interface GenericExplainerGraphV1 {
  title: string;
  summary: string;
  family_hint: string;
  scene_outline: AnimationSceneOutlineItem[];
  timeline: {
    total_steps: number;
  };
  scenes: GraphScene[];
  steps: GraphStepFrame[];
  camera: {
    mode: "fixed";
    focus_region?: string | null;
    zoom_target?: string | null;
  };
  style: {
    tone: string;
    density: "airy" | "balanced" | "dense";
  };
  used_primitives: string[];
}

export interface ExplainerDraftV1 {
  story_beats: string[];
  entities_outline: Array<{
    id: string;
    kind: GraphEntity["kind"];
    label: string;
  }>;
  step_captions: Array<{
    caption_title: string;
    caption_body: string;
  }>;
  action_hints: string[][];
  layout_intent: string;
  focus_targets: string[];
  family_hint: string;
  style_tone: string;
}

export interface AnimationArtifactRuntimeSnapshot {
  runtimeVersion: string;
  componentCode: string;
  compileStatus: AnimationCompileStatus;
  compileErrors: AnimationCompileError[];
  runtimePlanVersion?: string | null;
  runtimePlan?: Record<string, unknown> | null;
  runtimeGraphVersion?: string | null;
  runtimeGraph?: GenericExplainerGraphV1 | null;
  runtimeDraftVersion?: string | null;
  runtimeDraft?: ExplainerDraftV1 | Record<string, unknown> | null;
  runtimeAttemptCount?: number;
  runtimeProvider?: string | null;
  runtimeModel?: string | null;
  runtimeDiagnostics?: AnimationRuntimeDiagnostics | null;
  runtimeValidationReport?: AnimationValidationReportItem[];
  runtimeSource?: string | null;
  runtimeContract?: string | null;
  familyHint?: string;
  sceneOutline: AnimationSceneOutlineItem[];
  usedPrimitives: string[];
  generationPromptDigest?: string;
  durationSeconds: number;
  rhythm?: string;
  stylePack?: string | null;
  title?: string;
  summary?: string;
  requiresRegeneration?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AnimationRuntimeTheme {
  background: string;
  accent: string;
  text: string;
}

export type ExplainerFamilyPresentationPreset =
  | "algorithm_demo"
  | "physics_mechanics"
  | "system_flow"
  | "math_transform";

export interface AnimationRuntimeProps {
  theme: AnimationRuntimeTheme;
}

export interface AnimationGraphRendererProps {
  graph: GenericExplainerGraphV1;
  theme: AnimationRuntimeTheme;
  theatreSequenceState?: TheatreSequenceState;
  motionCanvasSceneManifest?: MotionCanvasSceneManifest;
}

export interface AnimationExecutionState {
  isPlaying: boolean;
  sequencePosition: number;
  stepIndex: number;
  totalSteps: number;
  globalProgress: number;
  sceneIndex: number;
  sceneProgress: number;
  playbackSpeed: number;
  currentSceneTitle?: string;
  hasAutoplayStarted?: boolean;
}

export interface TheatreSequenceTrackKeyframe {
  frame: number;
  value: number | string | boolean | null;
}

export interface TheatreSequenceTrack {
  objectId: string;
  prop: string;
  keyframes: TheatreSequenceTrackKeyframe[];
}

export interface TheatreSequenceObjectState {
  objectId: string;
  role: "playback" | "scene" | "entity" | "caption" | "camera";
  props: Record<string, number | string | boolean | null>;
}

export interface TheatreSequenceSceneRange {
  id: string;
  title: string;
  startFrame: number;
  endFrame: number;
}

export interface TheatreSequenceState {
  projectId: string;
  sheetId: string;
  familyPreset: ExplainerFamilyPresentationPreset;
  durationFrames: number;
  stepDurationFrames: number;
  sceneRanges: TheatreSequenceSceneRange[];
  objects: TheatreSequenceObjectState[];
  tracks: TheatreSequenceTrack[];
}

export interface TheatreSequenceProjectBinding {
  project: unknown;
  sheet: {
    address: {
      sheetId: string;
    };
    sequence: {
      position: number;
      play?: (conf?: unknown) => Promise<boolean>;
      pause?: () => void;
    };
  };
  objects: Map<string, unknown>;
}

export interface MotionCanvasSceneStepManifest {
  stepIndex: number;
  startFrame: number;
  endFrame: number;
  caption: GraphCaptionStream;
  entities: GraphEntity[];
  actions: GraphAction[];
  focusTargets: string[];
}

export interface MotionCanvasSceneManifestItem {
  id: string;
  title: string;
  summary?: string | null;
  preset: ExplainerFamilyPresentationPreset;
  startFrame: number;
  endFrame: number;
  steps: MotionCanvasSceneStepManifest[];
}

export interface MotionCanvasSceneManifest {
  projectName: string;
  familyPreset: ExplainerFamilyPresentationPreset;
  width: number;
  height: number;
  durationFrames: number;
  scenes: MotionCanvasSceneManifestItem[];
}

export interface AnimationCompileResult {
  ok: boolean;
  component: React.ComponentType<AnimationRuntimeProps> | null;
  errors: AnimationCompileError[];
}

export interface AnimationSandboxInitMessage {
  type: "animation-runtime:init";
  sessionToken: string;
  snapshot: AnimationArtifactRuntimeSnapshot;
  executionState: AnimationExecutionState;
  theme: AnimationRuntimeTheme;
}

export interface AnimationSandboxUpdateMessage {
  type: "animation-runtime:update";
  sessionToken: string;
  executionState: AnimationExecutionState;
  theme: AnimationRuntimeTheme;
}

export interface AnimationSandboxReadyEvent {
  type: "animation-runtime:ready";
  sessionToken: string;
}

export interface AnimationSandboxErrorEvent {
  type: "animation-runtime:compile-error" | "animation-runtime:runtime-error";
  sessionToken: string;
  errors: AnimationCompileError[];
}

export interface AnimationSandboxTelemetryEvent {
  type: "animation-runtime:telemetry";
  sessionToken: string;
  sequencePosition: number;
  stepIndex: number;
  totalSteps: number;
  currentSceneTitle?: string;
}

export type AnimationSandboxInboundEvent =
  | AnimationSandboxReadyEvent
  | AnimationSandboxErrorEvent
  | AnimationSandboxTelemetryEvent;

export type AnimationSandboxOutboundMessage =
  | AnimationSandboxInitMessage
  | AnimationSandboxUpdateMessage;
