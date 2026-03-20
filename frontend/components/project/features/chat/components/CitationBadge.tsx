"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CitationViewModel } from "@/lib/chat/citation-view-model";

const sourceLabelMap: Record<CitationViewModel["sourceType"], string> = {
  document: "文档",
  web: "网页",
  video: "视频",
  audio: "音频",
  ai_generated: "AI",
};

export function CitationBadge({
  citation,
  index,
  onClick,
}: {
  citation: CitationViewModel;
  index: number;
  onClick: () => void;
}) {
  return (
    <Badge
      variant="outline"
      onClick={onClick}
      className="gap-1.5 px-2.5 py-1 text-[10px] font-medium cursor-pointer hover:bg-zinc-50 hover:border-zinc-300 transition-colors shadow-sm"
      title={citation.contentPreview || citation.filename}
    >
      <span className="text-[10px] font-semibold text-zinc-700">{index + 1}</span>
      <ExternalLink className="w-3 h-3" />
      <span className="rounded bg-zinc-100 px-1 py-0.5 text-[9px] text-zinc-600">
        {sourceLabelMap[citation.sourceType]}
      </span>
      <span className="truncate max-w-[100px]">{citation.filename}</span>
      {citation.pageNumber && (
        <span className="text-zinc-400 font-normal">P{citation.pageNumber}</span>
      )}
      {typeof citation.timestamp === "number" && (
        <span className="text-zinc-400 font-normal">
          {Math.round(citation.timestamp)}s
        </span>
      )}
    </Badge>
  );
}
