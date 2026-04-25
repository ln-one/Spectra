import type { ComponentType } from "react";
import { WordToolPanel } from "./WordToolPanel";
import { MindmapToolPanel } from "./MindmapToolPanel";
import { GameToolPanel } from "./GameToolPanel";
import { QuizToolPanel } from "./QuizToolPanel";
import { SpeakerNotesToolPanel } from "./SpeakerNotesToolPanel";
import { AnimationToolPanel } from "./AnimationToolPanel";
import { SimulationToolPanel } from "./SimulationToolPanel";
import type { StudioToolKey, ToolPanelProps } from "./types";

export { WordToolPanel } from "./WordToolPanel";
export { MindmapToolPanel } from "./MindmapToolPanel";
export { GameToolPanel } from "./GameToolPanel";
export { QuizToolPanel } from "./QuizToolPanel";
export { SpeakerNotesToolPanel } from "./SpeakerNotesToolPanel";
export { AnimationToolPanel } from "./AnimationToolPanel";
export { SimulationToolPanel } from "./SimulationToolPanel";
export type {
  CapabilityStatus,
  ManagedResolvedTarget,
  ManagedResultTarget,
  ManagedTargetKind,
  ResolvedArtifactContentKind,
  ResolvedArtifactPayload,
  StudioGovernanceRubric,
  StudioWorkflowState,
  ToolArtifactPreviewItem,
  ToolDraftState,
  ToolFlowContext,
  ToolPanelProps,
  ToolSourceOption,
  StudioToolKey,
} from "./types";

export const STUDIO_TOOL_COMPONENTS: Record<
  StudioToolKey,
  ComponentType<ToolPanelProps>
> = {
  word: WordToolPanel,
  mindmap: MindmapToolPanel,
  outline: GameToolPanel,
  quiz: QuizToolPanel,
  summary: SpeakerNotesToolPanel,
  animation: AnimationToolPanel,
  handout: SimulationToolPanel,
};
