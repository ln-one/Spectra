"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DraftResultWorkbenchShellProps {
  showDraft: boolean;
  showResult: boolean;
  draft: ReactNode;
  result: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function DraftResultWorkbenchShell({
  showDraft,
  showResult,
  draft,
  result,
  className,
  bodyClassName,
}: DraftResultWorkbenchShellProps) {
  return (
    <div
      className={cn(
        "project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/80 shadow-2xl shadow-zinc-200/30 backdrop-blur-xl",
        className
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div
          className={cn(
            "min-h-0 flex-1 space-y-3 overflow-y-auto p-3",
            bodyClassName
          )}
        >
          {showDraft ? draft : null}
          {showResult ? result : null}
        </div>
      </div>
    </div>
  );
}
