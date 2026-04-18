"use client";

import { motion } from "framer-motion";
import type { ComponentProps } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { TOOL_LABELS, type StudioTool } from "../../constants";
import { SessionArtifacts } from "../../components/SessionArtifacts";
import { ToolGrid } from "../../components/ToolGrid";
import type { StudioHistoryItem } from "../../history/types";
import type { ToolArtifactPreviewItem } from "../../tools";

interface StudioCollapsedViewProps {
  isExpanded: boolean;
  hoveredToolId: string | null;
  onHoveredToolIdChange: (toolId: string | null) => void;
  onToolClick: (tool: StudioTool) => void;
  hasHistory: boolean;
  groupedHistory: ComponentProps<typeof SessionArtifacts>["groupedHistory"];
  currentCardId: string | null;
  selectedSourceId: string | null;
  latestArtifacts: ToolArtifactPreviewItem[];
  projectId: string | null;
  activeSessionId: string | null;
  fetchArtifactHistory: (
    projectId: string,
    sessionId: string | null
  ) => Promise<void>;
  onOpenHistoryItem: (item: StudioHistoryItem) => void | Promise<void>;
  onArchiveHistoryItem: (item: StudioHistoryItem) => void;
}

export function StudioCollapsedView({
  isExpanded,
  hoveredToolId,
  onHoveredToolIdChange,
  onToolClick,
  hasHistory,
  groupedHistory,
  projectId,
  activeSessionId,
  fetchArtifactHistory,
  onOpenHistoryItem,
  onArchiveHistoryItem,
}: StudioCollapsedViewProps) {
  return (
    <motion.div
      className={cn(
        "absolute inset-0",
        isExpanded ? "z-0 pointer-events-none" : "z-20 pointer-events-auto"
      )}
      animate={{
        opacity: isExpanded ? 0 : 1,
        scale: isExpanded ? 0.985 : 1,
      }}
      transition={{ duration: 0.4 }}
    >
      <ScrollArea className="h-full">
        <div className="p-3">
          <ToolGrid
            isExpanded={isExpanded}
            hoveredToolId={hoveredToolId}
            onHoveredToolIdChange={onHoveredToolIdChange}
            onToolClick={onToolClick}
          />
          {hasHistory && !isExpanded ? (
            <SessionArtifacts
              groupedHistory={groupedHistory}
              toolLabels={TOOL_LABELS}
              onRefresh={() => {
                if (!projectId) return;
                void fetchArtifactHistory(projectId, activeSessionId);
              }}
              onOpenHistoryItem={onOpenHistoryItem}
              onArchiveHistoryItem={onArchiveHistoryItem}
            />
          ) : null}
        </div>
      </ScrollArea>
    </motion.div>
  );
}
