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

function getReadinessLabel(value: string | null): string {
  switch (value) {
    case "ready":
      return "可直接执行";
    case "foundation_ready":
      return "基础能力已就绪";
    case "protocol_pending":
      return "协议待补齐";
    default:
      return "能力识别中";
  }
}

function getContextModeLabel(value: string | undefined): string {
  switch (value) {
    case "session":
      return "基于当前会话";
    case "artifact":
      return "基于成果物";
    case "hybrid":
      return "会话与成果混合";
    default:
      return "上下文待确认";
  }
}

function getExecutionModeLabel(value: string | undefined): string {
  switch (value) {
    case "session_command":
      return "会话命令执行";
    case "artifact_create":
      return "直接创建成果";
    case "composite":
      return "复合执行链路";
    default:
      return "执行方式待确认";
  }
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
  }) => Promise<string | null | undefined>;
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
  const display = toolFlowContext.display;
  const title =
    display?.productTitle ??
    currentCapability?.title ??
    (expandedTool ? TOOL_LABELS[expandedTool] : "");
  const description =
    display?.productDescription ??
    currentCapability?.notes ??
    "当前卡片会直接走后端真实链路，不再渲染前端示意内容。";
  const actionLabels = display?.actionLabels ?? {
    preview: "执行预检",
    loadSources: "刷新来源",
    execute: "开始执行",
    refine: "对话微调",
  };
  const sourceBindingCopy = display?.sourceBinding ?? {
    required: "必选：请先绑定一个来源成果。",
    optional: "可选：绑定已有成果后，结果会更贴近当前项目上下文。",
    empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
  };

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
                <>
                  <div className="rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-control-bg)] p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--project-text-primary)]">
                            {getReadinessLabel(currentReadiness)}
                          </span>
                          {supportsChatRefine ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                              支持对话微调
                            </span>
                          ) : null}
                          {requiresSourceArtifact ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                              需要绑定来源成果
                            </span>
                          ) : null}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--project-text-primary)]">
                            {title}
                          </p>
                          <p className="text-xs text-[var(--project-control-muted)]">
                            {description}
                          </p>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                        <SelectedSourceScopeBadge />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 text-xs"
                          onClick={() => {
                            void onPreviewExecution();
                          }}
                          disabled={
                            !currentCardId ||
                            isStudioActionRunning ||
                            isLoadingCardProtocol
                          }
                        >
                          {actionLabels.preview}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 text-xs"
                          onClick={() => {
                            void onLoadSources();
                          }}
                          disabled={
                            !currentCardId ||
                            isStudioActionRunning ||
                            isLoadingCardProtocol
                          }
                        >
                          {actionLabels.loadSources}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 text-xs"
                          onClick={onOpenChatRefine}
                          disabled={!canRefine || isLoadingCardProtocol}
                        >
                          {actionLabels.refine}
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 shrink-0 text-xs"
                          onClick={() => {
                            void onExecute();
                          }}
                          disabled={!canExecute || isLoadingCardProtocol}
                        >
                          {actionLabels.execute}
                        </Button>
                      </div>
                    </div>
                    {currentCardId && sourceOptions.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium text-[var(--project-control-muted)]">
                          当前来源：
                        </span>
                        <select
                          value={selectedSourceId ?? ""}
                          onChange={(event) =>
                            onSelectedSourceChange(event.target.value || null)
                          }
                          className="h-8 min-w-0 max-w-[280px] flex-1 rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] px-2 text-xs text-[var(--project-text-primary)]"
                        >
                          {sourceOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {(() => {
                                const baseTitle = item.title || item.id.slice(0, 8);
                                const compactTitle =
                                  baseTitle.length > 28
                                    ? `${baseTitle.slice(0, 28)}...`
                                    : baseTitle;
                                return (
                                  compactTitle + (item.type ? ` (${item.type})` : "")
                                );
                              })()}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : currentCardId ? (
                      <p className="text-[11px] text-[var(--project-control-muted)]">
                        {sourceBindingCopy.empty}
                      </p>
                    ) : null}
                    {currentCapability?.actions?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {currentCapability.actions.map((action) => (
                          <span
                            key={`${currentCapability.id}-${action.type}`}
                            className="rounded-full border border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] px-2.5 py-1 text-[11px] text-[var(--project-control-muted)]"
                          >
                            {action.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {currentCardId ? (
                    <div className="rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-surface-muted)] px-3 py-2 text-[11px] text-[var(--project-control-muted)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                          状态：{getReadinessLabel(currentReadiness)}
                        </span>
                        <span className="rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                          上下文：{getContextModeLabel(currentCapability?.context_mode)}
                        </span>
                        <span className="rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                          执行：{getExecutionModeLabel(currentCapability?.execution_mode)}
                        </span>
                        <span className="rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                          微调：{supportsChatRefine ? "已接入" : "未接入"}
                        </span>
                        <span className="rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                          来源：{requiresSourceArtifact ? "必选成果物" : "可选增强"}
                        </span>
                      </div>
                      {requiresSourceArtifact && !hasSourceBinding ? (
                        <p className="mt-1 text-amber-700">
                          {sourceBindingCopy.required}
                        </p>
                      ) : !requiresSourceArtifact ? (
                        <p className="mt-1 text-[var(--project-control-muted)]">
                          {sourceBindingCopy.optional}
                        </p>
                      ) : null}
                      {toolFlowContext.isProtocolPending ? (
                        <p className="mt-1 text-amber-700">
                          当前卡片协议尚未补齐，执行与微调暂不可用。
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
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
