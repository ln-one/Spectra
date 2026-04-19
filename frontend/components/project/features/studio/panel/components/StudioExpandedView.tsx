"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ComponentProps, ComponentType } from "react";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import { GenerationConfigPanel } from "@/components/project";
import { cn } from "@/lib/utils";
import { TOOL_LABELS } from "../../constants";
import type {
  StudioToolKey,
  ToolDraftState,
  ToolFlowContext,
} from "../../tools";

interface StudioExpandedViewProps {
  isExpanded: boolean;
  expandedTool: GenerationToolType | null;
  expandedToolComponent: ComponentType<{
    toolId: StudioToolKey;
    toolName: string;
    onDraftChange?: (draft: ToolDraftState) => void;
    flowContext?: ToolFlowContext;
  }> | null;
  pptResumeStage: "config" | "outline";
  pptResumeSignal: number;
  onPptWorkflowStageChange: NonNullable<
    ComponentProps<typeof GenerationConfigPanel>["onWorkflowStageChange"]
  >;
  onPptGenerate: (config: {
    pageCount: number;
    outlineStyle: "structured" | "story" | "problem" | "workshop";
    prompt: string;
    visualStyle: string;
    layoutMode: "smart" | "classic";
    templateId: string | null;
    visualPolicy: "auto" | "media_required" | "basic_graphics_only";
  }) => Promise<{ sessionId: string; runId: string } | null | undefined>;
  isCardManagedFlowExpanded: boolean;
  currentCardId: string | null;
  isStudioActionRunning: boolean;
  isLoadingCardProtocol: boolean;
  sourceOptions: Array<{ id: string; title?: string; type?: string }>;
  selectedSourceId: string | null;
  onSelectedSourceChange: (sourceId: string | null) => void;
  canRefine: boolean;
  canExecute: boolean;
  onOpenChatRefine: () => void;
  onPreviewExecution: () => Promise<void> | void;
  onLoadSources: () => Promise<void> | void;
  onExecute: () => Promise<void> | void;
  currentReadiness: string | null;
  currentCapability: unknown | null;
  supportsChatRefine: boolean;
  requiresSourceArtifact: boolean;
  hasSourceBinding: boolean;
  onDraftChange?: (draft: ToolDraftState) => void;
  toolFlowContext: ToolFlowContext;
}

export function StudioExpandedView({
  isExpanded,
  expandedTool,
  expandedToolComponent: ExpandedToolComponent,
  pptResumeStage,
  pptResumeSignal,
  onPptWorkflowStageChange,
  onPptGenerate,
  isCardManagedFlowExpanded: _isCardManagedFlowExpanded,
  currentCardId: _currentCardId,
  isStudioActionRunning: _isStudioActionRunning,
  isLoadingCardProtocol: _isLoadingCardProtocol,
  sourceOptions: _sourceOptions,
  selectedSourceId: _selectedSourceId,
  onSelectedSourceChange: _onSelectedSourceChange,
  canRefine: _canRefine,
  canExecute: _canExecute,
  onOpenChatRefine: _onOpenChatRefine,
  onPreviewExecution: _onPreviewExecution,
  onLoadSources: _onLoadSources,
  onExecute: _onExecute,
  currentReadiness: _currentReadiness,
  currentCapability: _currentCapability,
  supportsChatRefine: _supportsChatRefine,
  requiresSourceArtifact: _requiresSourceArtifact,
  hasSourceBinding: _hasSourceBinding,
  onDraftChange,
  toolFlowContext,
}: StudioExpandedViewProps) {
  return (
    <AnimatePresence>
      {expandedTool && isExpanded ? (
        <motion.div
          key="studio-expanded-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "absolute inset-0 z-10 p-3",
            isExpanded ? "pointer-events-auto" : "pointer-events-none"
          )}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.05, duration: 0.15 }}
            className="h-full w-full"
          >
            {expandedTool === "ppt" ? (
              <div className="h-full">
                <GenerationConfigPanel
                  variant="compact"
                  resumeStage={pptResumeStage}
                  resumeSignal={pptResumeSignal}
                  onWorkflowStageChange={onPptWorkflowStageChange}
                  onGenerate={onPptGenerate}
                />
              </div>
            ) : ExpandedToolComponent ? (
              <div className="h-full">
                <ExpandedToolComponent
                  toolId={expandedTool as StudioToolKey}
                  toolName={TOOL_LABELS[expandedTool] ?? expandedTool}
                  onDraftChange={onDraftChange}
                  flowContext={toolFlowContext}
                />
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
