"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useProjectStore, GENERATION_TOOLS } from "@/stores/projectStore";
import { studioCardsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import type {
  StudioCardCapability,
  StudioCardExecutionPlan,
} from "@/lib/sdk/studio-cards";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { GenerationConfigPanel } from "@/components/project";
import { STUDIO_TOOL_COMPONENTS } from "./tools";
import type { StudioToolKey, ToolDraftState } from "./tools";
import {
  ICON_LAYOUT_TRANSITION,
  TOOL_COLORS,
  TOOL_ICONS,
  TOOL_LABELS,
  type StudioTool,
} from "./constants";
import { SessionArtifacts } from "./components/SessionArtifacts";
import { ToolGrid } from "./components/ToolGrid";

interface StudioPanelProps {
  onToolClick?: (tool: StudioTool) => void;
}

const STUDIO_CARD_BY_TOOL: Partial<Record<StudioToolKey, string>> = {
  word: "word_document",
  mindmap: "knowledge_mindmap",
  outline: "interactive_games",
  quiz: "interactive_quick_quiz",
  summary: "speaker_notes",
  animation: "demonstration_animations",
  handout: "classroom_qa_simulator",
};

export function StudioPanel({ onToolClick }: StudioPanelProps) {
  const router = useRouter();
  const {
    project,
    layoutMode,
    expandedTool,
    artifactHistoryByTool,
    currentSessionArtifacts,
    activeSessionId,
    setActiveSessionId,
    fetchArtifactHistory,
    exportArtifact,
    setLayoutMode,
    setExpandedTool,
    startGeneration,
  } = useProjectStore();
  const [hoveredToolId, setHoveredToolId] = useState<string | null>(null);
  const [toolDrafts, setToolDrafts] = useState<
    Partial<Record<StudioToolKey, ToolDraftState>>
  >({});
  const [isStudioActionRunning, setIsStudioActionRunning] = useState(false);
  const [selectedSourceByCard, setSelectedSourceByCard] = useState<
    Record<string, string | null>
  >({});
  const [sourceOptionsByCard, setSourceOptionsByCard] = useState<
    Record<string, Array<{ id: string; title?: string; type?: string }>>
  >({});
  const [cardCapabilitiesById, setCardCapabilitiesById] = useState<
    Record<string, StudioCardCapability>
  >({});
  const [executionPlanByCardId, setExecutionPlanByCardId] = useState<
    Record<string, StudioCardExecutionPlan>
  >({});
  const [isLoadingCardProtocol, setIsLoadingCardProtocol] = useState(false);
  const isExpanded = layoutMode === "expanded";
  const groupedArtifacts = Object.entries(artifactHistoryByTool).filter(
    ([, items]) => items.length > 0
  );
  const currentTool = GENERATION_TOOLS.find(
    (tool) => tool.type === expandedTool
  );
  const CurrentIcon = currentTool ? TOOL_ICONS[currentTool.id] : Sparkles;
  const currentColor = currentTool
    ? TOOL_COLORS[currentTool.id]
    : TOOL_COLORS.ppt;
  const ExpandedToolComponent =
    expandedTool && expandedTool !== "ppt"
      ? STUDIO_TOOL_COMPONENTS[expandedTool as StudioToolKey]
      : null;
  const currentCardId =
    expandedTool && expandedTool !== "ppt"
      ? (STUDIO_CARD_BY_TOOL[expandedTool as StudioToolKey] ?? null)
      : null;
  const currentToolDraft = useMemo(
    () =>
      expandedTool && expandedTool !== "ppt"
        ? toolDrafts[expandedTool as StudioToolKey] || {}
        : {},
    [expandedTool, toolDrafts]
  );
  const currentCapability = currentCardId
    ? (cardCapabilitiesById[currentCardId] ?? null)
    : null;
  const currentExecutionPlan = currentCardId
    ? (executionPlanByCardId[currentCardId] ?? null)
    : null;
  const selectedSourceId = currentCardId
    ? (selectedSourceByCard[currentCardId] ?? null)
    : null;
  const draftSourceArtifactId =
    typeof currentToolDraft.source_artifact_id === "string"
      ? currentToolDraft.source_artifact_id
      : null;
  const requiresSourceArtifact =
    currentCapability?.requires_source_artifact ?? false;
  const supportsChatRefine = currentCapability?.supports_chat_refine ?? true;
  const currentReadiness =
    currentExecutionPlan?.readiness ?? currentCapability?.readiness ?? null;
  const isProtocolPending = currentReadiness === "protocol_pending";
  const hasSourceBinding = Boolean(selectedSourceId || draftSourceArtifactId);
  const canExecute =
    Boolean(currentCardId) &&
    !isStudioActionRunning &&
    !isProtocolPending &&
    (!requiresSourceArtifact || hasSourceBinding);
  const canRefine =
    Boolean(currentCardId) &&
    !isStudioActionRunning &&
    !isProtocolPending &&
    supportsChatRefine &&
    (!requiresSourceArtifact || hasSourceBinding);

  useEffect(() => {
    if (!currentCardId) return;
    if (
      cardCapabilitiesById[currentCardId] &&
      executionPlanByCardId[currentCardId]
    ) {
      return;
    }

    let cancelled = false;
    const loadCardProtocol = async () => {
      try {
        setIsLoadingCardProtocol(true);
        const [detailResponse, planResponse] = await Promise.all([
          studioCardsApi.getCard(currentCardId),
          studioCardsApi.getExecutionPlan(currentCardId),
        ]);
        if (cancelled) return;
        if (detailResponse?.data?.studio_card) {
          setCardCapabilitiesById((prev) => ({
            ...prev,
            [currentCardId]: detailResponse.data.studio_card,
          }));
        }
        if (planResponse?.data?.execution_plan) {
          setExecutionPlanByCardId((prev) => ({
            ...prev,
            [currentCardId]: planResponse.data.execution_plan,
          }));
        }
      } catch (error) {
        if (cancelled) return;
        toast({
          title: "获取卡片协议失败",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) {
          setIsLoadingCardProtocol(false);
        }
      }
    };

    void loadCardProtocol();
    return () => {
      cancelled = true;
    };
  }, [cardCapabilitiesById, currentCardId, executionPlanByCardId]);

  useEffect(() => {
    if (!currentCardId) return;
    if (selectedSourceByCard[currentCardId]) return;
    if (!draftSourceArtifactId) return;
    setSelectedSourceByCard((prev) => ({
      ...prev,
      [currentCardId]: draftSourceArtifactId,
    }));
  }, [currentCardId, draftSourceArtifactId, selectedSourceByCard]);

  const handleToolClick = (tool: StudioTool) => {
    setLayoutMode("expanded");
    setExpandedTool(tool.type);
    onToolClick?.(tool);
  };

  const handleClose = () => {
    setLayoutMode("normal");
    setExpandedTool(null);
    setHoveredToolId(null);
  };

  const buildStudioExecutionRequest = () => {
    if (!project || !currentCardId) return null;
    const selectedSource = selectedSourceByCard[currentCardId] ?? undefined;
    const draftSourceArtifactId =
      typeof currentToolDraft.source_artifact_id === "string"
        ? currentToolDraft.source_artifact_id
        : undefined;
    return {
      project_id: project.id,
      client_session_id: activeSessionId ?? undefined,
      source_artifact_id: selectedSource || draftSourceArtifactId || undefined,
      config: currentToolDraft,
    };
  };

  const handleStudioLoadSources = async () => {
    if (!project || !currentCardId || isStudioActionRunning) return;
    try {
      setIsStudioActionRunning(true);
      const response = await studioCardsApi.getSources(
        currentCardId,
        project.id
      );
      const sources = response?.data?.sources ?? [];
      setSourceOptionsByCard((prev) => ({
        ...prev,
        [currentCardId]: sources.map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
        })),
      }));
      if (!selectedSourceByCard[currentCardId] && sources.length > 0) {
        setSelectedSourceByCard((prev) => ({
          ...prev,
          [currentCardId]: sources[0]?.id ?? null,
        }));
      }
      toast({
        title: "源成果已刷新",
        description: `获取到 ${sources.length} 条可绑定成果。`,
      });
    } catch (error) {
      toast({
        title: "获取源成果失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsStudioActionRunning(false);
    }
  };

  const handleStudioPreviewExecution = async () => {
    if (!currentCardId || isStudioActionRunning) return;
    const requestBody = buildStudioExecutionRequest();
    if (!requestBody) return;
    try {
      setIsStudioActionRunning(true);
      const response = await studioCardsApi.getExecutionPreview(
        currentCardId,
        requestBody
      );
      const preview = response?.data?.execution_preview ?? {};
      const endpoint =
        typeof preview.endpoint === "string"
          ? preview.endpoint
          : typeof preview.initial_request === "object" &&
              preview.initial_request &&
              "endpoint" in preview.initial_request
            ? String(
                (preview.initial_request as Record<string, unknown>).endpoint
              )
            : "unknown endpoint";
      toast({
        title: "执行预览已生成",
        description: endpoint,
      });
    } catch (error) {
      toast({
        title: "执行预览失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsStudioActionRunning(false);
    }
  };

  const handleStudioExecute = async () => {
    if (!project || !currentCardId || isStudioActionRunning) return;
    if (isProtocolPending) {
      toast({
        title: "卡片协议未就绪",
        description: "当前卡片仍在协议补齐中，暂不可执行。",
        variant: "destructive",
      });
      return;
    }
    if (requiresSourceArtifact && !hasSourceBinding) {
      toast({
        title: "缺少源成果",
        description: "当前卡片需要先绑定 source artifact。",
        variant: "destructive",
      });
      return;
    }
    const requestBody = buildStudioExecutionRequest();
    if (!requestBody) return;
    try {
      setIsStudioActionRunning(true);
      const response = await studioCardsApi.execute(currentCardId, requestBody);
      const executionResult = response?.data?.execution_result ?? {};
      const session =
        typeof executionResult.session === "object"
          ? (executionResult.session as Record<string, unknown>)
          : null;
      const sessionId =
        (session?.session_id as string | undefined) ||
        (session?.id as string | undefined) ||
        null;
      if (sessionId) {
        setActiveSessionId(sessionId);
      }
      await fetchArtifactHistory(project.id, sessionId ?? activeSessionId);
      toast({
        title: "Studio 执行成功",
        description: sessionId
          ? `已生成会话 ${sessionId.slice(0, 8)}`
          : "已提交生成并刷新成果列表",
      });
    } catch (error) {
      toast({
        title: "Studio 执行失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsStudioActionRunning(false);
    }
  };

  const handleStudioRefine = async () => {
    if (!project || !currentCardId || isStudioActionRunning) return;
    if (isProtocolPending) {
      toast({
        title: "卡片协议未就绪",
        description: "当前卡片仍在协议补齐中，暂不可 refine。",
        variant: "destructive",
      });
      return;
    }
    if (!supportsChatRefine) {
      toast({
        title: "当前卡片不支持 refine",
        description: "后端协议未声明 refine 能力。",
        variant: "destructive",
      });
      return;
    }
    if (requiresSourceArtifact && !hasSourceBinding) {
      toast({
        title: "缺少源成果",
        description: "当前卡片需要先绑定 source artifact。",
        variant: "destructive",
      });
      return;
    }
    const message = window.prompt("输入 refine 指令");
    if (!message || !message.trim()) return;
    const requestBody = buildStudioExecutionRequest();
    if (!requestBody) return;
    try {
      setIsStudioActionRunning(true);
      const response = await studioCardsApi.refine(currentCardId, {
        project_id: project.id,
        session_id: activeSessionId ?? undefined,
        message: message.trim(),
        source_artifact_id: requestBody.source_artifact_id,
        config: requestBody.config,
      });
      const refinedSessionId = response?.data?.session_id ?? activeSessionId;
      await fetchArtifactHistory(project.id, refinedSessionId);
      toast({
        title: "Studio refine 成功",
        description: refinedSessionId
          ? `会话 ${refinedSessionId.slice(0, 8)} 已更新`
          : "已提交 refine 请求",
      });
    } catch (error) {
      toast({
        title: "Studio refine 失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsStudioActionRunning(false);
    }
  };

  return (
    <div
      className="h-full bg-transparent"
      style={{ transform: "translateZ(0)" }}
    >
      <Card className="h-full overflow-hidden rounded-2xl border border-[var(--project-border)] bg-[var(--project-surface)] text-[var(--project-text-primary)] shadow-lg backdrop-blur-xl will-change-[box-shadow,transform]">
        <CardHeader
          className="relative flex flex-row items-center justify-between px-4 py-0 shrink-0 space-y-0"
          style={{ height: "52px" }}
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            <LayoutGroup>
              <motion.div
                className="flex min-w-0 flex-col justify-center"
                layout
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <CardTitle className="truncate text-sm font-semibold leading-tight">
                  <motion.span
                    className="block truncate"
                    layout
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  >
                    {isExpanded ? TOOL_LABELS[expandedTool || "ppt"] : "Studio"}
                  </motion.span>
                </CardTitle>
                <CardDescription className="truncate text-xs leading-tight text-[var(--project-text-muted)]">
                  <motion.span
                    className="block truncate"
                    layout
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  >
                    {isExpanded ? "配置生成参数" : "AI 生成工具"}
                  </motion.span>
                </CardDescription>
              </motion.div>
            </LayoutGroup>
          </div>

          <AnimatePresence>
            {isExpanded ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="shrink-0 text-xs text-[var(--project-text-muted)] hover:text-[var(--project-text-primary)]"
                >
                  关闭
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {isExpanded && expandedTool ? (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
              <motion.div
                layoutId={`icon-${expandedTool}`}
                layout="position"
                className={cn(
                  "flex items-center justify-center rounded-xl border border-white/40 backdrop-blur-md transform-gpu will-change-transform [backface-visibility:hidden]"
                )}
                style={{
                  width: 40,
                  height: 40,
                  background: `linear-gradient(135deg, ${currentColor.glow}, transparent)`,
                  boxShadow: `0 8px 22px ${currentColor.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
                }}
                transition={{ layout: ICON_LAYOUT_TRANSITION }}
              >
                <CurrentIcon
                  className="h-4.5 w-4.5"
                  style={{ color: currentColor.primary }}
                />
              </motion.div>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="relative h-[calc(100%-52px)] overflow-hidden p-0">
          <LayoutGroup>
            <motion.div
              className={cn(
                "absolute inset-0",
                isExpanded ? "pointer-events-none" : "pointer-events-auto"
              )}
              animate={{
                opacity: isExpanded ? 0 : 1,
                scale: isExpanded ? 0.985 : 1,
              }}
              transition={{ duration: 0.2 }}
            >
              <ScrollArea className="h-full">
                <div className="p-3">
                  <ToolGrid
                    isExpanded={isExpanded}
                    hoveredToolId={hoveredToolId}
                    onHoveredToolIdChange={setHoveredToolId}
                    onToolClick={handleToolClick}
                  />
                  {currentSessionArtifacts.length > 0 && !isExpanded ? (
                    <SessionArtifacts
                      groupedArtifacts={groupedArtifacts}
                      toolLabels={TOOL_LABELS}
                      onRefresh={() => {
                        if (!project) return;
                        void fetchArtifactHistory(project.id, activeSessionId);
                      }}
                      onOpenArtifact={(item) => {
                        if (!project) return;
                        if (item.sessionId) setActiveSessionId(item.sessionId);
                        router.push(
                          `/projects/${project.id}/generate?session=${
                            item.sessionId ?? activeSessionId ?? ""
                          }`
                        );
                      }}
                      onExportArtifact={(artifactId) => {
                        void exportArtifact(artifactId);
                      }}
                    />
                  ) : null}
                </div>
              </ScrollArea>
            </motion.div>

            <AnimatePresence>
              {isExpanded && expandedTool ? (
                <motion.div
                  key={`${expandedTool}-expanded-content`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 p-3"
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
                          onGenerate={async (config) => {
                            const tool = GENERATION_TOOLS.find(
                              (item) => item.type === expandedTool
                            );
                            if (!project || !tool) return;
                            const styleToneMap: Record<string, string> = {
                              structured: "严谨、逻辑清晰、层次分明",
                              story: "叙事化、生动、循序渐进",
                              problem: "问题驱动、启发式、强调思考",
                              workshop: "实操导向、案例化、可落地",
                            };
                            await startGeneration(project.id, tool, {
                              template: "default",
                              show_page_number: true,
                              include_animations: false,
                              include_games: false,
                              use_text_to_image: false,
                              pages: Number(config.pageCount) || 15,
                              audience: "intermediate",
                              system_prompt_tone: [
                                `[outline_style=${config.outlineStyle}]`,
                                config.prompt,
                                `【大纲风格】${styleToneMap[config.outlineStyle] || "逻辑清晰"}`,
                                "【页面比例】16:9",
                                "请在每页中给出明确教学目标与讲解节奏。",
                              ].join("\n"),
                            });
                          }}
                        />
                      </div>
                    ) : ExpandedToolComponent ? (
                      <div className="h-full flex flex-col gap-2">
                        <div className="rounded-lg border border-zinc-200 bg-white/80 px-2 py-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => {
                              void handleStudioPreviewExecution();
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
                            className="h-8 text-xs"
                            onClick={() => {
                              void handleStudioLoadSources();
                            }}
                            disabled={
                              !currentCardId ||
                              isStudioActionRunning ||
                              isLoadingCardProtocol
                            }
                          >
                            源成果
                          </Button>
                          {currentCardId &&
                          sourceOptionsByCard[currentCardId]?.length > 0 ? (
                            <select
                              value={selectedSourceByCard[currentCardId] ?? ""}
                              onChange={(event) =>
                                setSelectedSourceByCard((prev) => ({
                                  ...prev,
                                  [currentCardId]: event.target.value || null,
                                }))
                              }
                              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs"
                            >
                              {sourceOptionsByCard[currentCardId].map(
                                (item) => (
                                  <option key={item.id} value={item.id}>
                                    {(item.title || item.id.slice(0, 8)) +
                                      (item.type ? ` (${item.type})` : "")}
                                  </option>
                                )
                              )}
                            </select>
                          ) : null}
                          <div className="ml-auto flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => {
                                void handleStudioRefine();
                              }}
                              disabled={!canRefine || isLoadingCardProtocol}
                            >
                              Refine
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => {
                                void handleStudioExecute();
                              }}
                              disabled={!canExecute || isLoadingCardProtocol}
                            >
                              执行
                            </Button>
                          </div>
                        </div>
                        {currentCardId ? (
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-[11px] text-zinc-600">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-white px-2 py-0.5 border border-zinc-200">
                                readiness: {currentReadiness ?? "loading"}
                              </span>
                              <span className="rounded bg-white px-2 py-0.5 border border-zinc-200">
                                context:{" "}
                                {currentCapability?.context_mode ?? "unknown"}
                              </span>
                              <span className="rounded bg-white px-2 py-0.5 border border-zinc-200">
                                mode:{" "}
                                {currentCapability?.execution_mode ?? "unknown"}
                              </span>
                              <span className="rounded bg-white px-2 py-0.5 border border-zinc-200">
                                refine: {supportsChatRefine ? "on" : "off"}
                              </span>
                              <span className="rounded bg-white px-2 py-0.5 border border-zinc-200">
                                source:{" "}
                                {requiresSourceArtifact
                                  ? "required"
                                  : "optional"}
                              </span>
                            </div>
                            {requiresSourceArtifact && !hasSourceBinding ? (
                              <p className="mt-1 text-amber-700">
                                当前卡片执行需要先绑定源成果。
                              </p>
                            ) : null}
                            {isProtocolPending ? (
                              <p className="mt-1 text-amber-700">
                                当前卡片协议处于 protocol_pending，执行/refine
                                已禁用。
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="min-h-0 flex-1">
                          <ExpandedToolComponent
                            toolId={expandedTool as StudioToolKey}
                            toolName={TOOL_LABELS[expandedTool] ?? expandedTool}
                            onDraftChange={(draft) => {
                              setToolDrafts((prev) => ({
                                ...prev,
                                [expandedTool as StudioToolKey]: draft,
                              }));
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </LayoutGroup>
        </CardContent>
      </Card>
    </div>
  );
}

export { StudioPanel as StudioExpandedPanel };
