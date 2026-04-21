"use client";

import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";

interface TeachingBriefInlineCardProps {
  className?: string;
  onOpenDialog?: () => void;
}

export function TeachingBriefInlineCard({
  className,
  onOpenDialog,
}: TeachingBriefInlineCardProps) {
  const latestBriefHint = useProjectStore((state) => state.latestBriefHint);
  const confirmTeachingBriefFromChat = useProjectStore(
    (state) => state.confirmTeachingBriefFromChat
  );
  const startPptFromTeachingBrief = useProjectStore(
    (state) => state.startPptFromTeachingBrief
  );
  const activeSessionId = useProjectStore((state) => state.activeSessionId);

  if (!latestBriefHint || !activeSessionId) {
    return null;
  }

  const {
    autoAppliedFields,
    aiRequestsConfirmation,
    briefStatus,
  } = latestBriefHint;

  const isConfirmed = briefStatus === "confirmed";

  // Case 3: Confirmed
  if (isConfirmed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "mx-4 my-2 overflow-hidden rounded-2xl border border-green-200 bg-green-50 shadow-sm",
          className
        )}
      >
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-green-900">
                教学需求已确认
              </h4>
              <p className="text-xs text-green-700">
                可以开始生成课件了
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="w-full shrink-0 bg-green-600 text-white hover:bg-green-700 sm:w-auto"
            onClick={() => startPptFromTeachingBrief(activeSessionId)}
          >
            <Play className="mr-2 h-4 w-4" />
            开始生成课件
          </Button>
        </div>
      </motion.div>
    );
  }

  // Case 2: AI Requests Confirmation
  if (aiRequestsConfirmation) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "mx-4 my-2 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-sm",
          className
        )}
      >
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-700">
              !
            </span>
            <h4 className="text-sm font-medium text-amber-900">
              需求梳理完成，请确认
            </h4>
          </div>
          <p className="mb-4 text-xs text-amber-800">
            我已经收集了足够的信息。如果以上内容准确，请确认需求单以继续。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="sm"
              className="flex-1 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                confirmTeachingBriefFromChat(activeSessionId);
              }}
            >
              确认需求
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
              onClick={onOpenDialog}
            >
              继续完善
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Case 1: Proposal Notification (Auto Applied Fields)
  if (autoAppliedFields && autoAppliedFields.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "mx-4 my-2 flex cursor-pointer items-center justify-between overflow-hidden rounded-xl border border-blue-100 bg-blue-50/50 p-3 hover:bg-blue-50 transition-colors",
          className
        )}
        onClick={onOpenDialog}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-blue-500" />
          <span className="text-xs font-medium text-blue-800">
            已识别：{autoAppliedFields.join(" · ")}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-blue-400" />
      </motion.div>
    );
  }

  return null;
}
