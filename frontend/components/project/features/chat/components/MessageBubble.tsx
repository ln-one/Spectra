"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, CircleX, Loader2 } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import {
  stripInlineCitationTags,
  toCitationViewModels,
} from "@/lib/chat/citation-view-model";
import { TOOL_COLORS } from "@/components/project/features/studio/constants";
import type { ChatMessage } from "../types";
import { CitationBadge } from "./CitationBadge";
import { MarkdownContent } from "./MarkdownContent";
import { ThinkingBubble } from "./ThinkingBubble";

function splitContentAndSources(content: string): { body: string } {
  const markers = ["\n\n来源：", "\n\n来源:"];
  const idx = markers
    .map((marker) => content.indexOf(marker))
    .find((value) => value >= 0);
  if (idx === undefined || idx < 0) {
    return { body: content };
  }
  return { body: content.slice(0, idx).trim() };
}

function dispatchOpenHistoryItem(message: ChatMessage): void {
  const localMeta = message.localMeta;
  if (!localMeta) return;
  const runId = localMeta.runId ?? null;
  const sessionId = localMeta.sessionId ?? null;
  const toolType = localMeta.refineToolType;
  if (!sessionId || !toolType) return;
  window.dispatchEvent(
    new CustomEvent("spectra:open-history-item", {
      detail: {
        origin: "workflow",
        toolType,
        step: "preview",
        status: "completed",
        sessionId,
        runId,
        artifactId: localMeta.artifactId ?? null,
      },
    })
  );
}

function dispatchOpenLibraryCitation(citation: {
  sourceLibraryId: string;
  sourceLibraryName?: string;
  filename?: string;
  chunkId: string;
  pageNumber?: number;
  timestamp?: number;
}): void {
  window.dispatchEvent(
    new CustomEvent("spectra:open-library-citation", {
      detail: citation,
    })
  );
}

function dispatchOpenArtifactCitation(citation: {
  sourceArtifactId: string;
  sourceArtifactTitle?: string;
  sourceArtifactToolType?: string;
  sourceArtifactSessionId?: string;
}): void {
  const rawToolType = String(citation.sourceArtifactToolType || "").trim();
  const toolType =
    rawToolType === "ppt" ||
    rawToolType === "word" ||
    rawToolType === "mindmap" ||
    rawToolType === "outline" ||
    rawToolType === "quiz" ||
    rawToolType === "summary" ||
    rawToolType === "animation" ||
    rawToolType === "handout"
      ? rawToolType
      : "summary";
  window.dispatchEvent(
    new CustomEvent("spectra:open-history-item", {
      detail: {
        id: `artifact:${citation.sourceArtifactId}`,
        origin: "artifact",
        toolType,
        title: citation.sourceArtifactTitle || "沉淀成果",
        status: "completed",
        createdAt: new Date().toISOString(),
        sessionId: citation.sourceArtifactSessionId || null,
        step: "preview",
        artifactId: citation.sourceArtifactId,
      },
    })
  );
}

export function MessageBubble({
  message,
  index,
  projectId,
  toolColor,
}: {
  message: ChatMessage;
  index: number;
  projectId: string;
  toolColor?: {
    primary: string;
    secondary: string;
    glow: string;
    soft: string;
  };
}) {
  const isUser = message.role === "user";
  const localMeta = message.localMeta;
  const isRefineStatus = localMeta?.kind === "studio_refine_status";
  const isRefineUser = localMeta?.kind === "studio_refine_user";
  const messageToolColor =
    localMeta?.refineToolType && TOOL_COLORS[localMeta.refineToolType]
      ? TOOL_COLORS[localMeta.refineToolType]
      : toolColor;
  const isInlineThinkingMessage =
    isRefineStatus && localMeta?.refineStatus === "processing";
  const { focusSourceByChunk } = useProjectStore(
    useShallow((state) => ({
      focusSourceByChunk: state.focusSourceByChunk,
    }))
  );
  const visibleContent = stripInlineCitationTags(message.content);
  const { body } = splitContentAndSources(visibleContent);
  const citations = useMemo(
    () => toCitationViewModels(message.citations),
    [message.citations]
  );
  const handleCitationClick = (citation: (typeof citations)[number]) => {
    if (citation.sourceScope === "attached_library" && citation.sourceLibraryId) {
      dispatchOpenLibraryCitation({
        sourceLibraryId: citation.sourceLibraryId,
        sourceLibraryName: citation.sourceLibraryName,
        filename: citation.filename,
        chunkId: citation.chunkId,
        pageNumber: citation.pageNumber,
        timestamp: citation.timestamp,
      });
      return;
    }
    if (citation.sourceScope === "project_deposit" && citation.sourceArtifactId) {
      dispatchOpenArtifactCitation({
        sourceArtifactId: citation.sourceArtifactId,
        sourceArtifactTitle: citation.sourceArtifactTitle,
        sourceArtifactToolType: citation.sourceArtifactToolType,
        sourceArtifactSessionId: citation.sourceArtifactSessionId,
      });
      return;
    }
    void focusSourceByChunk(citation.chunkId, projectId, citation);
  };

  if (isInlineThinkingMessage) {
    return <ThinkingBubble toolColor={messageToolColor} />;
  }

  if (isRefineStatus) {
    const isDone = localMeta?.refineStatus === "completed";
    const isFailed = localMeta?.refineStatus === "failed";
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-start"
      >
        <button
          type="button"
          onClick={() => {
            if (isDone) dispatchOpenHistoryItem(message);
          }}
          disabled={!isDone}
          className={cn(
            "flex max-w-[82%] items-center gap-2 rounded-2xl rounded-tl-sm border px-3 py-2 text-left text-sm transition-colors",
            isDone
              ? "cursor-pointer hover:brightness-95"
              : "cursor-default opacity-95",
            isFailed
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-[var(--project-border)] bg-[var(--project-surface-elevated)] text-[var(--project-text-primary)]"
          )}
          style={
            !isFailed && messageToolColor
              ? {
                  borderColor: messageToolColor.primary,
                  backgroundColor: `color-mix(in srgb, ${messageToolColor.primary} 6%, var(--project-surface-elevated))`,
                }
              : undefined
          }
        >
          {isDone ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          ) : isFailed ? (
            <CircleX className="h-4 w-4 shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          )}
          <span className="whitespace-pre-wrap">{visibleContent}</span>
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.03,
        type: "spring",
        stiffness: 400,
        damping: 30,
      }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "flex max-w-[82%] flex-col gap-1.5",
          isUser ? "items-end" : "items-start"
        )}
      >
        <motion.div
          initial={{ opacity: 0, x: isUser ? 10 : -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.03 + 0.05 }}
          className={cn(
            "px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isUser
              ? "rounded-2xl rounded-tr-sm bg-[linear-gradient(135deg,var(--project-accent),var(--project-accent-hover))] text-[var(--project-accent-text)]"
              : "rounded-2xl rounded-tl-sm border border-[var(--project-border)] bg-[var(--project-surface-elevated)] text-[var(--project-text-primary)]"
          )}
          style={
            isUser && isRefineUser && messageToolColor
              ? {
                  background: `linear-gradient(135deg, ${messageToolColor.primary}, ${messageToolColor.secondary})`,
                  color: "#fff",
                }
              : undefined
          }
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{visibleContent}</span>
          ) : (
            <div className="relative">
              <MarkdownContent content={body} isUser={isUser} />
            </div>
          )}
        </motion.div>

        {citations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 + 0.15 }}
            className="mt-0.5 flex flex-wrap gap-1.5"
          >
              {citations.map((citation, i) => (
                <CitationBadge
                  key={`${citation.chunkId}-${i}`}
                  citation={citation}
                  index={i}
                  onClick={() => handleCitationClick(citation)}
                />
              ))}
            </motion.div>
          )}

        <span className="px-1 text-[10px] font-medium text-[var(--project-text-muted)]">
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </motion.div>
  );
}
