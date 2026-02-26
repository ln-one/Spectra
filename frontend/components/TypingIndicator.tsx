"use client";

import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  className?: string;
}

export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 p-4 text-gray-500",
        className
      )}
    >
      <div className="flex gap-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-bounce absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75">
          </span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-500">
          </span>
        </span>
        <span className="relative flex h-2 w-2">
          <span className="animate-bounce absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" style={{ animationDelay: "0.2s" }}>
          </span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-500" style={{ animationDelay: "0.2s" }}>
          </span>
        </span>
        <span className="relative flex h-2 w-2">
          <span className="animate-bounce absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" style={{ animationDelay: "0.4s" }}>
          </span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-500" style={{ animationDelay: "0.4s" }}>
          </span>
        </span>
      </div>
      <span className="ml-2 text-sm">AI 正在思考...</span>
    </div>
  );
}
