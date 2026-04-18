"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ComponentProps, ComponentType } from "react";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import type { StudioCardCapability } from "@/lib/sdk/studio-cards";
import { Button } from "@/components/ui/button";
import { GenerationConfigPanel } from "@/components/project";
import { cn } from "@/lib/utils";
import { TOOL_LABELS } from "../../constants";
import type {
  StudioToolKey,
  ToolDraftState,
  ToolFlowContext,
} from "../../tools";
import { SelectedSourceScopeBadge } from "@/components/project/features/sources/components/SelectedSourceScopeBadge";

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
  currentCapability: StudioCardCapability | null;
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
  isCardManagedFlowExpanded,
  currentCardId,
  isStudioActionRunning,
  isLoadingCardProtocol,
  sourceOptions,
  selectedSourceId,
  onSelectedSourceChange,
  canRefine,
  canExecute,
  onOpenChatRefine,
  onPreviewExecution,
  onLoadSources,
  onExecute,
  currentReadiness,
  currentCapability,
  supportsChatRefine,
  requiresSourceArtifact,
  hasSourceBinding,
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
              <div className="h-full flex flex-col gap-2">
                {!isCardManagedFlowExpanded ? (
                  <>
                    <div className="project-studio-protocol-bar rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-control-bg)] px-2 py-2 flex min-w-0 flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="project-studio-protocol-btn h-8 shrink-0 text-xs"
                        onClick={() => {
                          void onPreviewExecution();
                        }}
                        disabled={
                          !currentCardId ||
                          isStudioActionRunning ||
                          isLoadingCardProtocol
                        }
                      >
                        预览协议
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="project-studio-protocol-btn h-8 shrink-0 text-xs"
                        onClick={() => {
                          void onLoadSources();
                        }}
                        disabled={
                          !currentCardId ||
                          isStudioActionRunning ||
                          isLoadingCardProtocol
                        }
                      >
                        加载来源
                      </Button>
                      {currentCardId && sourceOptions.length > 0 ? (
                        <select
                          value={selectedSourceId ?? ""}
                          onChange={(event) =>
                            onSelectedSourceChange(event.target.value || null)
                          }
                          className="project-studio-protocol-select h-8 min-w-0 max-w-[180px] flex-1 basis-[140px] rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] px-2 text-xs text-[var(--project-text-primary)]"
                        >
                          {sourceOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {(() => {
                                const baseTitle =
                                  item.title || item.id.slice(0, 8);
                                const compactTitle =
                                  baseTitle.length > 18
                                    ? `${baseTitle.slice(0, 18)}...`
                                    : baseTitle;
                                return (
                                  compactTitle +
                                  (item.type ? ` (${item.type})` : "")
                                );
                              })()}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
                        <SelectedSourceScopeBadge />
                        <Button
                          size="sm"
                          variant="outline"
                          className="project-studio-protocol-btn h-8 shrink-0 text-xs"
                          onClick={onOpenChatRefine}
                          disabled={!canRefine || isLoadingCardProtocol}
                        >
                          Refine
                        </Button>
                        <Button
                          size="sm"
                          className="project-studio-protocol-btn project-studio-protocol-btn-primary h-8 shrink-0 text-xs"
                          onClick={() => {
                            void onExecute();
                          }}
                          disabled={!canExecute || isLoadingCardProtocol}
                        >
                          执行
                        </Button>
                      </div>
                    </div>
                    {currentCardId ? (
                      <div className="project-studio-protocol-meta rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-surface-muted)] px-3 py-2 text-[11px] text-[var(--project-control-muted)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="project-studio-meta-chip rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                            readiness: {currentReadiness ?? "loading"}
                          </span>
                          <span className="project-studio-meta-chip rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                            context:{" "}
                            {currentCapability?.context_mode ?? "unknown"}
                          </span>
                          <span className="project-studio-meta-chip rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                            mode:{" "}
                            {currentCapability?.execution_mode ?? "unknown"}
                          </span>
                          <span className="project-studio-meta-chip rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                            refine: {supportsChatRefine ? "on" : "off"}
                          </span>
                          <span className="project-studio-meta-chip rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                            source:{" "}
                            {requiresSourceArtifact ? "required" : "optional"}
                          </span>
                        </div>
                        {requiresSourceArtifact && !hasSourceBinding ? (
                          <p className="mt-1 text-amber-700">
                            当前卡片执行需要先绑定源成果。
                          </p>
                        ) : null}
                        {toolFlowContext.isProtocolPending ? (
                          <p className="mt-1 text-amber-700">
                            当前卡片协议处于protocol_pending，执行/refine
                            已禁用。
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="min-h-0 flex-1">
                  <ExpandedToolComponent
                    toolId={expandedTool as StudioToolKey}
                    toolName={TOOL_LABELS[expandedTool] ?? expandedTool}
                    onDraftChange={onDraftChange}
                    flowContext={toolFlowContext}
                  />
                </div>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
