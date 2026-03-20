"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useProjectStore, GENERATION_TOOLS } from "@/stores/projectStore";
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
import { GenerationConfigPanel } from "@/components/project";
import { STUDIO_TOOL_COMPONENTS } from "./tools";
import type { StudioToolKey } from "./tools";
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
  const isExpanded = layoutMode === "expanded";
  const groupedArtifacts = Object.entries(artifactHistoryByTool).filter(
    ([, items]) => items.length > 0
  );
  const currentTool = GENERATION_TOOLS.find((tool) => tool.type === expandedTool);
  const CurrentIcon = currentTool ? TOOL_ICONS[currentTool.id] : Sparkles;
  const currentColor = currentTool ? TOOL_COLORS[currentTool.id] : TOOL_COLORS.ppt;
  const ExpandedToolComponent =
    expandedTool && expandedTool !== "ppt"
      ? STUDIO_TOOL_COMPONENTS[expandedTool as StudioToolKey]
      : null;

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

  return (
    <div className="h-full bg-transparent" style={{ transform: "translateZ(0)" }}>
      <Card className="h-full overflow-hidden rounded-2xl border border-[var(--project-border)] bg-[var(--project-surface)] text-[var(--project-text-primary)] shadow-lg backdrop-blur-xl will-change-[box-shadow,transform]">
        <CardHeader
          className="relative flex flex-row items-center justify-between px-4 py-0 shrink-0 space-y-0"
          style={{ height: "52px" }}
        >
          <div className="h-full shrink-0 overflow-hidden flex-col justify-center">
            <LayoutGroup>
              <motion.div
                className="flex flex-col justify-center"
                layout
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <CardTitle className="text-sm font-semibold leading-tight">
                  <motion.span
                    layout
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  >
                    {isExpanded ? TOOL_LABELS[expandedTool || "ppt"] : "Studio"}
                  </motion.span>
                </CardTitle>
                <CardDescription className="text-xs leading-tight text-[var(--project-text-muted)]">
                  <motion.span
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
                <CurrentIcon className="h-4.5 w-4.5" style={{ color: currentColor.primary }} />
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
              animate={{ opacity: isExpanded ? 0 : 1, scale: isExpanded ? 0.985 : 1 }}
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
                      <ExpandedToolComponent
                        toolId={expandedTool as StudioToolKey}
                        toolName={TOOL_LABELS[expandedTool] ?? expandedTool}
                      />
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

