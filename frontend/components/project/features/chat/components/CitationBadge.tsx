"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CitationViewModel } from "@/lib/chat/citation-view-model";

const sourceLabelMap: Record<CitationViewModel["sourceType"], string> = {
  document: "\u6587\u6863",
  web: "\u7f51\u9875",
  video: "\u89c6\u9891",
  audio: "\u97f3\u9891",
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
      className="cursor-pointer gap-1.5 border-[var(--project-border)] bg-[var(--project-surface)] px-2.5 py-1 text-[10px] font-medium text-[var(--project-text-primary)] transition-colors hover:bg-[var(--project-surface-muted)]"
      title={citation.contentPreview || citation.filename}
    >
      <span className="text-[10px] font-semibold text-[var(--project-text-primary)]">
        {index + 1}
      </span>
      <ExternalLink className="h-3 w-3 text-[var(--project-text-muted)]" />
      <span className="rounded bg-[var(--project-surface-muted)] px-1 py-0.5 text-[9px] text-[var(--project-text-muted)]">
        {sourceLabelMap[citation.sourceType]}
      </span>
      <span className="max-w-[100px] truncate">{citation.filename}</span>
      {citation.pageNumber && (
        <span className="font-normal text-[var(--project-text-muted)]">
          P{citation.pageNumber}
        </span>
      )}
      {typeof citation.timestamp === "number" && (
        <span className="font-normal text-[var(--project-text-muted)]">
          {Math.round(citation.timestamp)}s
        </span>
      )}
    </Badge>
  );
}
