"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { FileText, Presentation, BookOpen, Brain, HelpCircle, FileEdit, Film, BookMarked, Sparkles, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useProjectStore, GENERATION_TOOLS, type GenerationTool } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { GenerationConfigPanel } from "./GenerationConfigPanel";

const TOOL_ICONS: Record<string, React.ElementType> = {
  ppt: Presentation,
  word: FileText,
  mindmap: Brain,
  outline: BookOpen,
  quiz: HelpCircle,
  summary: FileEdit,
  animation: Film,
  handout: BookMarked,
};

const TOOL_TITLES: Record<string, string> = {
  ppt: "PPT 课件生成",
  word: "Word 文档生成",
  mindmap: "思维导图生成",
  outline: "课程大纲生成",
  quiz: "测验题目生成",
  summary: "内容摘要生成",
  animation: "动画脚本生成",
  handout: "讲义生成",
};

const TOOL_COLORS: Record<string, { primary: string; secondary: string; gradient: string; glow: string }> = {
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
    primary: "#8b5cf6",
    secondary: "#a78bfa",
    gradient: "from-violet-500 to-purple-500",
    glow: "rgba(139, 92, 246, 0.25)",
  },
  outline: {
    primary: "#10b981",
    secondary: "#34d399",
    gradient: "from-emerald-500 to-teal-500",
    glow: "rgba(16, 185, 129, 0.25)",
  },
  quiz: {
    primary: "#ec4899",
    secondary: "#f472b6",
    gradient: "from-pink-500 to-rose-500",
    glow: "rgba(236, 72, 153, 0.25)",
  },
  summary: {
    primary: "#06b6d4",
    secondary: "#22d3ee",
    gradient: "from-cyan-500 to-sky-500",
    glow: "rgba(6, 182, 212, 0.25)",
  },
  animation: {
    primary: "#f43f5e",
    secondary: "#fb7185",
    gradient: "from-rose-500 to-red-500",
    glow: "rgba(244, 63, 94, 0.25)",
  },
  handout: {
    primary: "#84cc16",
    secondary: "#a3e635",
    gradient: "from-lime-500 to-green-500",
    glow: "rgba(132, 204, 22, 0.25)",
  },
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
    generationHistory,
    setLayoutMode,
    setExpandedTool,
    startGeneration
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

  const currentTool = GENERATION_TOOLS.find(t => t.type === expandedTool);
  const CurrentIcon = currentTool ? TOOL_ICONS[currentTool.id] : Sparkles;
  const currentColor = currentTool ? TOOL_COLORS[currentTool.id] : TOOL_COLORS.ppt;

  return (
    <div className="h-full bg-transparent" style={{ transform: "translateZ(0)" }}>
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
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    >
                      {isExpanded ? TOOL_TITLES[expandedTool || "ppt"] : "Studio"}
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
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
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
            <motion.div
              layoutId={`icon-${expandedTool}`}
              className={cn(
                "absolute left-1/2 -translate-x-1/2 z-50",
                "rounded-xl flex items-center justify-center",
                "backdrop-blur-md border border-white/40"
              )}
              style={{
                top: "8px",
                width: 36,
                height: 36,
                background: `linear-gradient(135deg, ${currentColor.glow}, transparent)`,
                boxShadow: `0 4px 12px ${currentColor.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
              }}
              initial={{ scale: 1 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <CurrentIcon
                className="w-4.5 h-4.5"
                style={{ color: currentColor.primary }}
              />
            </motion.div>
          )}
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-52px)]">
          <ScrollArea className="h-full">
            <motion.div
              layout
              className="p-3 relative"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            >
              <LayoutGroup>
                <motion.div
                  className="grid grid-cols-2 gap-2 pb-2"
                  animate={{
                    opacity: isExpanded ? 0 : 1,
                    scale: isExpanded ? 0.95 : 1,
                  }}
                  transition={{ duration: 0.2 }}
                  style={{ pointerEvents: isExpanded ? "none" : "auto" }}
                >
                  {GENERATION_TOOLS.map((tool) => {
                    const Icon = TOOL_ICONS[tool.id] || Sparkles;
                    const color = TOOL_COLORS[tool.id] || TOOL_COLORS.ppt;
                    const isThisExpanded = isExpanded && expandedTool === tool.id;
                    const isHovered = hoveredToolId === tool.id;
                    return (
                      <motion.button
                        key={tool.id}
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{
                          scale: isHovered && !isExpanded ? 1.02 : 1,
                          opacity: 1,
                          y: isHovered && !isExpanded ? -2 : 0
                        }}
                        whileTap={{ scale: 0.98 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 25,
                        }}
                        onClick={() => handleToolClick(tool)}
                        onMouseEnter={() => !isExpanded && setHoveredToolId(tool.id)}
                        onMouseLeave={() => setHoveredToolId(null)}
                        className={cn(
                          "group relative w-full h-auto flex flex-col items-center justify-center p-3",
                          "bg-gradient-to-br from-zinc-50/90 to-zinc-100/60 backdrop-blur-sm",
                          "border border-zinc-200/60",
                          "rounded-xl cursor-pointer",
                          "transition-shadow duration-200 ease-out"
                        )}
                        style={{
                          boxShadow: isHovered && !isExpanded
                            ? `0 8px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)`
                            : `0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)`,
                          borderColor: isHovered && !isExpanded ? 'rgba(161, 161, 170, 0.5)' : 'rgba(228, 228, 231, 0.6)',
                        }}
                      >
                        <motion.div
                          layoutId={`icon-${tool.id}`}
                          className={cn(
                            "rounded-xl flex items-center justify-center mb-1.5",
                            "backdrop-blur-md border border-white/40"
                          )}
                          style={{
                            width: 36,
                            height: 36,
                            background: `linear-gradient(135deg, ${color.glow}, transparent)`,
                            boxShadow: `0 4px 12px ${color.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
                            opacity: isThisExpanded ? 0 : 1,
                          }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
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

                <AnimatePresence>
                  {isExpanded && expandedTool && (
                    <motion.div
                      key={`${expandedTool}-expanded-content`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 flex flex-col pointer-events-auto"
                      style={{ padding: "0 12px" }}
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
                                const tool = GENERATION_TOOLS.find(t => t.type === expandedTool);
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
                        ) : (
                          <div className="bg-zinc-50/90 backdrop-blur-sm border border-zinc-200/60 rounded-xl p-4 h-full flex flex-col items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center mb-3">
                              <Sparkles className="w-6 h-6 text-zinc-400" />
                            </div>
                            <p className="text-sm font-medium text-zinc-600 mb-1">功能开发中</p>
                            <p className="text-xs text-zinc-400 text-center">
                              {TOOL_TITLES[expandedTool]}功能即将上线
                            </p>
                            <p className="text-xs text-zinc-300 mt-2">敬请期待</p>
                          </div>
                        )}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </LayoutGroup>

              {generationHistory.length > 0 && !isExpanded && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pt-2 border-t border-zinc-100"
                >
                  <h3 className="text-xs font-medium text-zinc-500 mb-2">最近生成</h3>
                  <div className="space-y-1.5">
                    <AnimatePresence>
                      {generationHistory.slice(0, 5).map((item, index) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ delay: index * 0.05 }}
                          className="flex items-center gap-2.5 p-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 cursor-pointer transition-colors"
                          onClick={() => {
                            if (!project) return;
                            if (item.sessionState === "AWAITING_OUTLINE_CONFIRM") {
                              router.push(`/projects/${project.id}`);
                              return;
                            }
                            router.push(`/projects/${project.id}/generate?session=${item.id}`);
                          }}
                        >
                          <div className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center">
                            {item.status === "completed" ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            ) : item.status === "failed" ? (
                              <XCircle className="w-3.5 h-3.5 text-red-500" />
                            ) : (
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              >
                                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                              </motion.div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-zinc-700 truncate">{item.title}</p>
                            <p className="text-[10px] text-zinc-400">
                              {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export { StudioPanel as StudioExpandedPanel };
