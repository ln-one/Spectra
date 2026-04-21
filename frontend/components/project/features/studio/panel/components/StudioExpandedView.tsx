"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LockKeyhole } from "lucide-react";
import type { ComponentProps, ComponentType } from "react";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import { GenerationConfigPanel } from "@/components/project";
import { cn } from "@/lib/utils";
import { LOCKED_STUDIO_TOOL_TYPES, TOOL_LABELS } from "../../constants";
import type {
  StudioToolKey,
  ToolDraftState,
  ToolFlowContext,
} from "../../tools";

function StudioLockedToolNotice({ toolName }: { toolName: string }) {
  return (
    <div className="relative flex h-full min-h-[360px] items-center justify-center overflow-hidden rounded-[28px] border border-[var(--project-border)] bg-[var(--project-surface-muted)] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,191,36,0.20),transparent_34%),radial-gradient(circle_at_78%_78%,rgba(14,165,233,0.14),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-4 rounded-[24px] border border-white/60 bg-white/25 backdrop-blur-[2px]" />
      <motion.div
        role="alert"
        aria-label={`${toolName}权限提示`}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        className="relative w-full max-w-[360px] rounded-[24px] border border-amber-200 bg-[var(--project-surface)] px-5 py-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.16)]"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 shadow-inner">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-[var(--project-text-primary)]">
          {toolName}暂未开通
        </h3>
        <p className="mt-2 text-sm leading-6 text-[var(--project-text-secondary)]">
          当前账号没有开通会员权限，请联系管理员
        </p>
      </motion.div>
    </div>
  );
}

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
  const isLockedTool =
    expandedTool !== null &&
    expandedTool !== "ppt" &&
    LOCKED_STUDIO_TOOL_TYPES.has(expandedTool as StudioToolKey);
  const expandedToolName = expandedTool
    ? TOOL_LABELS[expandedTool] ?? expandedTool
    : "";

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
            ) : isLockedTool ? (
              <StudioLockedToolNotice toolName={expandedToolName} />
            ) : ExpandedToolComponent ? (
              <div className="h-full">
                <ExpandedToolComponent
                  toolId={expandedTool as StudioToolKey}
                  toolName={expandedToolName}
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
