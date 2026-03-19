"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  FileText,
  Presentation,
  Gamepad2,
  Brain,
  CircleHelp,
  GraduationCap,
  Film,
  Radar,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  Download,
} from "lucide-react";
import {
  useProjectStore,
  GENERATION_TOOLS,
  type GenerationTool,
} from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { GenerationConfigPanel } from "./GenerationConfigPanel";
import type { ArtifactHistoryItem } from "@/lib/project-space/artifact-history";
import { STUDIO_TOOL_COMPONENTS } from "./studio-tools";
import type { StudioToolKey } from "./studio-tools";

const TOOL_ICONS: Record<string, React.ElementType> = {
  ppt: Presentation,
  word: FileText,
  mindmap: Brain,
  outline: Gamepad2,
  quiz: CircleHelp,
  summary: GraduationCap,
  animation: Film,
  handout: Radar,
};

const TOOL_LABELS: Record<string, string> = Object.fromEntries(
  GENERATION_TOOLS.map((tool) => [tool.type, tool.name])
) as Record<string, string>;

const TOOL_COLORS: Record<
  string,
  { primary: string; secondary: string; gradient: string; glow: string }
> = {
  ppt: {
    primary: "#f97316",
    secondary: "#fb923c",
    gradient: "from-orange-500 to-amber-500",
    glow: "rgba(249, 115, 22, 0.25)",
  },
  word: {
    primary: "#3b82f6",
    secondary: "#60a5fa",
    gradient: "from-blue-500 to-sky-500",
    glow: "rgba(59, 130, 246, 0.25)",
  },
  mindmap: {
    primary: "#14b8a6",
    secondary: "#2dd4bf",
    gradient: "from-teal-500 to-emerald-500",
    glow: "rgba(20, 184, 166, 0.25)",
  },
  outline: {
    primary: "#f43f5e",
    secondary: "#fb7185",
    gradient: "from-rose-500 to-pink-500",
    glow: "rgba(244, 63, 94, 0.25)",
  },
  quiz: {
    primary: "#8b5cf6",
    secondary: "#a78bfa",
    gradient: "from-violet-500 to-indigo-500",
    glow: "rgba(139, 92, 246, 0.25)",
  },
  summary: {
    primary: "#0ea5e9",
    secondary: "#38bdf8",
    gradient: "from-sky-500 to-cyan-500",
    glow: "rgba(14, 165, 233, 0.25)",
  },
  animation: {
    primary: "#22c55e",
    secondary: "#4ade80",
    gradient: "from-green-500 to-emerald-500",
    glow: "rgba(34, 197, 94, 0.25)",
  },
  handout: {
    primary: "#eab308",
    secondary: "#facc15",
    gradient: "from-yellow-500 to-amber-500",
    glow: "rgba(234, 179, 8, 0.25)",
  },
};

const ICON_LAYOUT_TRANSITION = {
  type: "tween" as const,
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

interface StudioPanelProps {
  onToolClick?: (tool: GenerationTool) => void;
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

  const handleToolClick = (tool: GenerationTool) => {
    setLayoutMode("expanded");
    setExpandedTool(tool.type);
    onToolClick?.(tool);
  };

  const handleClose = () => {
    setLayoutMode("normal");
    setExpandedTool(null);
    setHoveredToolId(null);
  };

  const groupedArtifacts = Object.entries(artifactHistoryByTool).filter(
    ([, items]) => items.length > 0
  ) as Array<[string, ArtifactHistoryItem[]]>;

  const currentTool = GENERATION_TOOLS.find((t) => t.type === expandedTool);
  const CurrentIcon = currentTool ? TOOL_ICONS[currentTool.id] : Sparkles;
  const currentColor = currentTool
    ? TOOL_COLORS[currentTool.id]
    : TOOL_COLORS.ppt;
  const ExpandedToolComponent =
    expandedTool && expandedTool !== "ppt"
      ? STUDIO_TOOL_COMPONENTS[expandedTool as StudioToolKey]
      : null;

  return (
    <div
      className="h-full bg-transparent"
      style={{ transform: "translateZ(0)" }}
    >
      <Card className="h-full rounded-2xl shadow-lg border border-white/60 bg-white/95 backdrop-blur-xl overflow-hidden will-change-[box-shadow,transform]">
        <CardHeader
          className="flex flex-row items-center justify-between px-4 space-y-0 py-0 shrink-0 relative"
          style={{ height: "52px" }}
        >
          <div className="flex flex-col justify-center shrink-0 h-full overflow-hidden">
            <LayoutGroup>
              <motion.div
                className="flex flex-col justify-center"
                layout
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <motion.div
                  layout
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  <CardTitle className="text-sm font-semibold leading-tight">
                    <motion.span
                      layout
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    >
                      {isExpanded
                        ? TOOL_LABELS[expandedTool || "ppt"]
                        : "Studio"}
                    </motion.span>
                  </CardTitle>
                </motion.div>
                <motion.div
                  layout
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  <CardDescription className="text-xs text-zinc-500 leading-tight">
                    <motion.span
                      layout
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    >
                      {isExpanded ? "配置生成参数" : "AI 生成工具"}
                    </motion.span>
                  </CardDescription>
                </motion.div>
              </motion.div>
            </LayoutGroup>
          </div>

          <AnimatePresence>
            {isExpanded && (
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
                  className="text-xs text-zinc-500 hover:text-zinc-700 shrink-0"
                >
                  关闭
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {isExpanded && expandedTool && (
            <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
              <motion.div
                layoutId={`icon-${expandedTool}`}
                layout="position"
                className={cn(
                  "rounded-xl flex items-center justify-center",
                  "backdrop-blur-md border border-white/40 transform-gpu will-change-transform [backface-visibility:hidden]"
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
                  className="w-4.5 h-4.5"
                  style={{ color: currentColor.primary }}
                />
              </motion.div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-52px)] overflow-hidden relative">
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
                  <motion.div
                    className="grid grid-cols-2 gap-2 pb-2"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  >
                    {GENERATION_TOOLS.map((tool) => {
                      const Icon = TOOL_ICONS[tool.id] || Sparkles;
                      const color = TOOL_COLORS[tool.id] || TOOL_COLORS.ppt;
                      const isHovered = hoveredToolId === tool.id;

                      return (
                        <motion.button
                          key={tool.id}
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{
                            scale: isHovered && !isExpanded ? 1.02 : 1,
                            opacity: 1,
                            y: isHovered && !isExpanded ? -2 : 0,
                          }}
                          whileTap={{ scale: 0.98 }}
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 25,
                          }}
                          onClick={() => handleToolClick(tool)}
                          onMouseEnter={() =>
                            !isExpanded && setHoveredToolId(tool.id)
                          }
                          onMouseLeave={() => setHoveredToolId(null)}
                          className={cn(
                            "group relative w-full h-auto flex flex-col items-center justify-center p-3",
                            "bg-gradient-to-br from-zinc-50/90 to-zinc-100/60 backdrop-blur-sm",
                            "border border-zinc-200/60",
                            "rounded-xl cursor-pointer",
                            "transition-shadow duration-200 ease-out"
                          )}
                          style={{
                            boxShadow:
                              isHovered && !isExpanded
                                ? `0 8px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)`
                                : `0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)`,
                            borderColor:
                              isHovered && !isExpanded
                                ? "rgba(161, 161, 170, 0.5)"
                                : "rgba(228, 228, 231, 0.6)",
                          }}
                        >
                          <motion.div
                            layoutId={`icon-${tool.id}`}
                            layout="position"
                            className={cn(
                              "rounded-xl flex items-center justify-center mb-1.5",
                              "backdrop-blur-md border border-white/40 transform-gpu will-change-transform [backface-visibility:hidden]"
                            )}
                            style={{
                              width: 40,
                              height: 40,
                              background: `linear-gradient(135deg, ${color.glow}, transparent)`,
                              boxShadow: `0 8px 22px ${color.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
                            }}
                            transition={{ layout: ICON_LAYOUT_TRANSITION }}
                          >
                            <Icon
                              className="w-4.5 h-4.5"
                              style={{ color: color.primary }}
                            />
                          </motion.div>
                          <span className="text-[11px] font-medium text-zinc-700 text-center">
                            {tool.name}
                          </span>
                          <motion.div
                            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                            style={{
                              background: `radial-gradient(circle at center, ${color.glow}, transparent 70%)`,
                            }}
                          />
                        </motion.button>
                      );
                    })}
                  </motion.div>

                  {currentSessionArtifacts.length > 0 && !isExpanded && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="pt-2 border-t border-zinc-100"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-medium text-zinc-500">
                          当前会话成果
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-zinc-500"
                          onClick={() => {
                            if (!project) return;
                            fetchArtifactHistory(project.id, activeSessionId);
                          }}
                        >
                          刷新
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <AnimatePresence>
                          {groupedArtifacts.map(([toolKey, items]) => (
                            <motion.div
                              key={toolKey}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              className="space-y-1.5"
                            >
                              <p className="text-[10px] text-zinc-400 uppercase tracking-wide">
                                {TOOL_LABELS[toolKey] ?? toolKey}
                              </p>
                              {items.slice(0, 3).map((item, index) => (
                                <motion.div
                                  key={item.artifactId}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 10 }}
                                  transition={{ delay: index * 0.04 }}
                                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-colors"
                                >
                                  <button
                                    className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center shrink-0"
                                    onClick={() => {
                                      if (!project) return;
                                      if (item.sessionId) {
                                        setActiveSessionId(item.sessionId);
                                      }
                                      router.push(
                                        `/projects/${project.id}/generate?session=${
                                          item.sessionId ??
                                          activeSessionId ??
                                          ""
                                        }`
                                      );
                                    }}
                                  >
                                    {item.status === "completed" ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : item.status === "failed" ? (
                                      <XCircle className="w-3.5 h-3.5 text-red-500" />
                                    ) : (
                                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                                    )}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium text-zinc-700 truncate">
                                      {item.title}
                                    </p>
                                    <p className="text-[10px] text-zinc-400">
                                      {new Date(item.createdAt).toLocaleString(
                                        "zh-CN"
                                      )}
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-lg"
                                    onClick={() =>
                                      exportArtifact(item.artifactId)
                                    }
                                  >
                                    <Download className="w-3.5 h-3.5 text-zinc-500" />
                                  </Button>
                                </motion.div>
                              ))}
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </div>
              </ScrollArea>
            </motion.div>

            <AnimatePresence>
              {isExpanded && expandedTool && (
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
                    className="w-full h-full"
                  >
                    {expandedTool === "ppt" ? (
                      <div className="h-full">
                        <GenerationConfigPanel
                          variant="compact"
                          onGenerate={async (config) => {
                            const tool = GENERATION_TOOLS.find(
                              (t) => t.type === expandedTool
                            );
                            if (project && tool) {
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
                            }
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
              )}
            </AnimatePresence>
          </LayoutGroup>
        </CardContent>
      </Card>
    </div>
  );
}

export { StudioPanel as StudioExpandedPanel };
