"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FileText, Presentation, BookOpen, Brain, HelpCircle, FileEdit, Film, BookMarked, ChevronRight, Sparkles, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useProjectStore, GENERATION_TOOLS, type GenerationTool } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

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

interface StudioPanelProps {
  onToolClick?: (tool: GenerationTool) => void;
}

export function StudioPanel({ onToolClick }: StudioPanelProps) {
  const { generationHistory, setLayoutMode, setExpandedTool } = useProjectStore();

  const handleToolClick = (tool: GenerationTool) => {
    setLayoutMode("expanded");
    setExpandedTool(tool.type);
    onToolClick?.(tool);
  };

  return (
    <div className="h-full p-1.5 bg-transparent">
      <Card className="h-full rounded-2xl shadow-lg border border-white/60 bg-white/95 backdrop-blur-xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between px-4 h-[52px] border-b border-zinc-100 space-y-0 py-0">
          <div className="flex flex-col justify-center">
            <CardTitle className="text-sm font-semibold">Studio</CardTitle>
            <CardDescription className="text-xs text-zinc-500">AI 生成工具</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-52px)]">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-2 gap-2 p-3 pb-2">
              {GENERATION_TOOLS.map((tool, index) => {
                const Icon = TOOL_ICONS[tool.id] || Sparkles;
                return (
                  <motion.div
                    key={tool.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 30 }}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => handleToolClick(tool)}
                      className={cn(
                        "group relative w-full h-auto flex-col items-center justify-center p-3",
                        "bg-zinc-50 hover:bg-zinc-100 border border-transparent hover:border-zinc-200",
                        "transition-all duration-200 rounded-xl"
                      )}
                    >
                      <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center mb-1.5 group-hover:shadow-md transition-shadow">
                        <Icon className="w-4.5 h-4.5 text-zinc-700" />
                      </div>
                      <span className="text-[11px] font-medium text-zinc-700 text-center">{tool.name}</span>
                      <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Button>
                  </motion.div>
                );
              })}
            </div>

            {generationHistory.length > 0 && (
              <div className="px-3 pb-3 pt-2 border-t border-zinc-100">
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
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export function StudioExpandedPanel() {
  const { expandedTool, setLayoutMode, setExpandedTool } = useProjectStore();

  const handleClose = () => {
    setLayoutMode("normal");
    setExpandedTool(null);
  };

  return (
    <Card className="h-full rounded-2xl shadow-2xl border border-white/60 bg-white/98 backdrop-blur-xl overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between px-5 py-3 space-y-0 border-b border-zinc-100">
        <div>
          <CardTitle className="text-base font-semibold">
            {expandedTool === "ppt" && "PPT 课件生成"}
            {expandedTool === "word" && "Word 文档生成"}
            {expandedTool === "mindmap" && "思维导图生成"}
            {expandedTool === "outline" && "课程大纲生成"}
            {expandedTool === "quiz" && "测验题目生成"}
            {expandedTool === "summary" && "内容摘要生成"}
            {expandedTool === "animation" && "动画脚本生成"}
            {expandedTool === "handout" && "讲义生成"}
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500 mt-0.5">配置生成参数</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs text-zinc-500 hover:text-zinc-700">
          关闭
        </Button>
      </CardHeader>

      <CardContent className="p-5 h-[calc(100%-64px)]">
        <ScrollArea className="h-full">
          <div className="space-y-5">
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-7 h-7 text-zinc-400" />
              </div>
              <p className="text-sm text-zinc-500">选择素材后开始生成</p>
              <p className="text-xs text-zinc-400 mt-1">请在右侧 Sources 面板选择文件</p>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
