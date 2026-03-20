"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { toCitationViewModels } from "@/lib/chat/citation-view-model";
import type { ChatMessage } from "../types";
import { CitationBadge } from "./CitationBadge";
import { MarkdownContent } from "./MarkdownContent";

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

export function MessageBubble({
  message,
  index,
  projectId,
}: {
  message: ChatMessage;
  index: number;
  projectId: string;
}) {
  const isUser = message.role === "user";
  const { focusSourceByChunk } = useProjectStore();
  const { body } = splitContentAndSources(message.content);
  const citations = useMemo(
    () => toCitationViewModels(message.citations),
    [message.citations]
  );

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
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{
          delay: index * 0.03 + 0.1,
          type: "spring",
          stiffness: 500,
          damping: 30,
        }}
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
          isUser
            ? "bg-gradient-to-br from-zinc-800 to-zinc-900"
            : "bg-gradient-to-br from-zinc-100 to-zinc-200"
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-zinc-600" />
        )}
      </motion.div>

      <div
        className={cn(
          "flex flex-col gap-1.5 max-w-[80%]",
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
              ? "bg-gradient-to-br from-zinc-800 to-zinc-900 text-white rounded-2xl rounded-tr-sm"
              : "bg-white border border-zinc-200 text-zinc-800 rounded-2xl rounded-tl-sm"
          )}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <div className="relative">
              <MarkdownContent content={body} isUser={isUser} />
              {citations.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {citations.map((citation, i) => (
                    <button
                      key={`${citation.chunkId}-${i}`}
                      onClick={() =>
                        focusSourceByChunk(citation.chunkId, projectId)
                      }
                      className="text-[10px] leading-none text-zinc-500 hover:text-zinc-900 transition-colors"
                      aria-label={`引用 ${i + 1}`}
                    >
                      <sup className="px-1 py-0.5 rounded bg-zinc-100 border border-zinc-200">
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
            className="flex flex-wrap gap-1.5 mt-1"
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

        <span className="text-[10px] text-zinc-400 px-1 font-medium">
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </motion.div>
  );
}
