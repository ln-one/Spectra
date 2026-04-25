"use client";

import { motion } from "framer-motion";
import { Wand2, AlertCircle, FileText, Play, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";

interface GenerationIntentCardProps {
  className?: string;
  onOpenDialog?: () => void;
}

export function GenerationIntentCard({
  className,
  onOpenDialog,
}: GenerationIntentCardProps) {
  const latestBriefHint = useProjectStore((state) => state.latestBriefHint);
  const startPptFromTeachingBrief = useProjectStore(
    (state) => state.startPptFromTeachingBrief
  );
  const activeSessionId = useProjectStore((state) => state.activeSessionId);

  if (!latestBriefHint || !activeSessionId || !latestBriefHint.generationIntent) {
    return null;
  }

  const {
    generationReady,
    generationBlockedReason,
    briefSnapshot,
    missingFields,
  } = latestBriefHint;

  if (generationReady) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={cn(
          "mx-4 my-3 overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-purple-50/80 shadow-md backdrop-blur-sm",
          className
        )}
      >
        <div className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
              <Wand2 className="h-3.5 w-3.5" />
            </div>
            <h4 className="text-sm font-bold text-indigo-900">
              🪄 检测到您想生成课件
            </h4>
          </div>
          
          <div className="mb-5 space-y-2 rounded-xl bg-white/50 p-3 text-xs text-indigo-900/80">
            <div className="flex justify-between items-center">
              <span className="font-medium shrink-0">主题：</span>
              <span className="truncate ml-2">{briefSnapshot?.topic || "未指定"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium shrink-0">受众：</span>
              <span className="truncate ml-2">{briefSnapshot?.audience || "未指定"}</span>
            </div>
            <div className="mt-3 flex items-center gap-4 text-[10px] text-indigo-700/60 border-t border-indigo-100/50 pt-2">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {briefSnapshot?.lesson_hours || 1} 课时
              </span>
              <span className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                {briefSnapshot?.target_pages || 20} 页
              </span>
              {briefSnapshot?.style_profile?.visual_tone && (
                <span className="truncate max-w-[80px]">风格：{briefSnapshot.style_profile.visual_tone}</span>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-indigo-200 bg-white/80 text-indigo-700 hover:bg-indigo-50 h-9"
              onClick={onOpenDialog}
            >
              查看完整需求单
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm h-9"
              onClick={() => startPptFromTeachingBrief(activeSessionId)}
            >
              <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
              开始生成课件
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Blocked State
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "mx-4 my-3 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-sm",
        className
      )}
    >
      <div className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <h4 className="text-sm font-bold text-amber-900">
            还差一点就可以开始生成了
          </h4>
        </div>
        
        <div className="mb-4 space-y-1.5 text-xs">
          {briefSnapshot?.topic && (
            <div className="flex items-center gap-1.5 text-green-700">
              <div className="h-1 w-1 rounded-full bg-green-500" />
              <span className="truncate">主题：{briefSnapshot.topic}</span>
            </div>
          )}
          {briefSnapshot?.audience && (
            <div className="flex items-center gap-1.5 text-green-700">
              <div className="h-1 w-1 rounded-full bg-green-500" />
              <span className="truncate">受众：{briefSnapshot.audience}</span>
            </div>
          )}
          {missingFields.map(field => (
            <div key={field} className="flex items-center gap-1.5 text-amber-700 font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>待补充：{field}</span>
            </div>
          ))}
        </div>

        <p className="mb-4 text-[11px] leading-relaxed text-amber-800/70">
          {generationBlockedReason || "请告诉我更多细节以补齐需求单。"}
        </p>

        <Button
          variant="outline"
          size="sm"
          className="w-full border-amber-300 bg-white/50 text-amber-700 hover:bg-amber-100 h-9"
          onClick={onOpenDialog}
        >
          查看完整需求单
        </Button>
      </div>
    </motion.div>
  );
}
