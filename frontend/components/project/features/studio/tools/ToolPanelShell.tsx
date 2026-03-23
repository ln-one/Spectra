"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TOOL_COLORS } from "../constants";
import { Sparkles } from "lucide-react";

interface ToolPanelShellProps {
  toolId?: string;
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
  toolId,
  stepTitle,
  stepDescription,
  previewTitle,
  previewDescription,
  className,
  children,
  preview,
  footer,
}: ToolPanelShellProps) {
  const colors = toolId ? TOOL_COLORS[toolId] : null;

  return (
    <div
      className={cn(
        "h-full rounded-2xl border border-zinc-200/60 bg-white/80 backdrop-blur-xl shadow-2xl shadow-zinc-200/30 overflow-hidden group/shell",
        className
      )}
      style={{
        ["--project-tool-accent" as any]: colors?.primary,
        ["--project-tool-accent-soft" as any]: colors?.glow,
        ["--project-tool-surface" as any]: colors?.soft,
        ["--project-tool-elevated" as any]: "rgba(255, 255, 255, 0.8)",
      }}
    >
      {/* Top Accent Bar */}
      {colors && (
        <div 
          className={cn("h-1 w-full bg-gradient-to-r", colors.gradient)}
        />
      )}

      <div className="h-full flex flex-col">
        <div className="px-5 py-4 border-b border-zinc-100/80 bg-zinc-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-white shadow-sm border border-zinc-100">
                <Sparkles className="w-4 h-4" style={{ color: colors?.primary || "#71717a" }} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 tracking-tight">{stepTitle}</h3>
                <p className="text-[11px] text-zinc-500 font-medium leading-tight">{stepDescription}</p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-white border-zinc-100 text-zinc-500 text-[10px] font-bold h-6 px-2 shadow-sm uppercase tracking-wider">
              AI Powered
            </Badge>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-6">
          <div className="space-y-4">
            {children}
          </div>
          
          <section className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-5 space-y-4 relative overflow-hidden group/preview">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover/preview:opacity-10 transition-opacity">
              <Sparkles className="w-12 h-12" style={{ color: colors?.primary }} />
            </div>
            
            <div>
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.15em]">
                {previewTitle}
              </h4>
              <p className="text-[11px] text-zinc-500 mt-1 font-medium leading-relaxed">
                {previewDescription}
              </p>
            </div>
            
            <div className="rounded-xl border border-zinc-100/80 bg-white shadow-sm min-h-[100px] relative z-10">
              {preview}
            </div>
          </section>
        </div>

        {footer ? (
          <div className="px-5 py-4 border-t border-zinc-100/80 bg-white/50 backdrop-blur-md">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
