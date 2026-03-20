"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ToolPanelShellProps {
  stepTitle: string;
  stepDescription: string;
  previewTitle: string;
  previewDescription: string;
  className?: string;
  children: ReactNode;
  preview: ReactNode;
  footer?: ReactNode;
}

export function ToolPanelShell({
  stepTitle,
  stepDescription,
  previewTitle,
  previewDescription,
  className,
  children,
  preview,
  footer,
}: ToolPanelShellProps) {
  return (
    <div
      className={cn(
        "h-full rounded-xl border border-zinc-200/80 bg-white",
        className
      )}
    >
      <div className="h-full flex flex-col">
        <div className="px-3 py-3 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-800">{stepTitle}</h3>
            <Badge variant="secondary" className="bg-zinc-100 text-zinc-700">
              交互原型
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 mt-1">{stepDescription}</p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
          {children}
          <section className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
            <h4 className="text-xs font-semibold text-zinc-700">
              {previewTitle}
            </h4>
            <p className="text-[11px] text-zinc-500 mt-1">
              {previewDescription}
            </p>
            <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
              {preview}
            </div>
          </section>
        </div>

        {footer ? (
          <div className="px-3 py-2 border-t border-zinc-100 bg-zinc-50/60">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
