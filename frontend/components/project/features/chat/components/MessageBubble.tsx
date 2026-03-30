"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useProjectStore } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { toCitationViewModels } from "@/lib/chat/citation-view-model";
import type { ChatMessage } from "../types";
import { CitationBadge } from "./CitationBadge";
import { MarkdownContent } from "./MarkdownContent";
import { ThinkingBubble } from "./ThinkingBubble";

function splitContentAndSources(content: string): { body: string } {
  const markers = ["\n\n\u6765\u6e90\uff1a", "\n\n\u6765\u6e90:"];
  const idx = markers
    .map((marker) => content.indexOf(marker))
    .find((value) => value >= 0);
  if (idx === undefined || idx < 0) {
    return { body: content };
  }
  return { body: content.slice(0, idx).trim() };
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
  const isInlineThinkingMessage =
    !isUser && message.content.includes("Spectra 正在构思");
  const { focusSourceByChunk } = useProjectStore(
    useShallow((state) => ({
      focusSourceByChunk: state.focusSourceByChunk,
    }))
  );
  const { body } = splitContentAndSources(message.content);
  const citations = useMemo(
    () => toCitationViewModels(message.citations),
    [message.citations]
  );

  return (
    isInlineThinkingMessage ? (
      <ThinkingBubble toolColor={toolColor} />
    ) : (
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
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <div className="relative">
              <MarkdownContent content={body} isUser={isUser} />
              {citations.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {citations.map((citation, i) => (
                    <button
                      key={`${citation.chunkId}-${i}`}
                      onClick={() =>
                        focusSourceByChunk(citation.chunkId, projectId)
                      }
                      className="text-[10px] leading-none text-[var(--project-text-muted)] transition-colors hover:text-[var(--project-text-primary)]"
                      aria-label={`\u5f15\u7528 ${i + 1}`}
                    >
                      <sup className="rounded border border-[var(--project-border)] bg-[var(--project-surface-muted)] px-1 py-0.5">
                        {i + 1}
                      </sup>
                    </button>
                  ))}
                </div>
              )}
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
                onClick={() => focusSourceByChunk(citation.chunkId, projectId)}
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
    )
  );
}
