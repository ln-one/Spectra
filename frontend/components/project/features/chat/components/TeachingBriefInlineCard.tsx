"use client";

import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { GenerationIntentCard } from "./GenerationIntentCard";

interface TeachingBriefInlineCardProps {
  className?: string;
  onOpenDialog?: () => void;
}

export function TeachingBriefInlineCard({
  className,
  onOpenDialog,
}: TeachingBriefInlineCardProps) {
  const latestBriefHint = useProjectStore((state) => state.latestBriefHint);
  const activeSessionId = useProjectStore((state) => state.activeSessionId);

  if (!latestBriefHint || !activeSessionId) {
    return null;
  }

  // Case 0: Generation Intent (Highest priority)
  if (latestBriefHint.generationIntent) {
    return (
      <GenerationIntentCard
        className={className}
        onOpenDialog={onOpenDialog}
      />
    );
  }

  const { autoAppliedFields } = latestBriefHint;

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
