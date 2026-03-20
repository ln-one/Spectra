"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SUGGESTIONS } from "./constants";
import { MessageBubble } from "./components/MessageBubble";
import type { ChatMessage } from "./types";

interface ChatPanelProps {
  projectId: string;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const {
    messages,
    isMessagesLoading,
    isSending,
    sendMessage,
    lastFailedInput,
    clearLastFailedInput,
  } = useProjectStore();

  const [input, setInput] = useState("");
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasHydratedHistoryRef = useRef(false);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    const behavior =
      hasHydratedHistoryRef.current && messages.length > 0 ? "smooth" : "auto";
    messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    hasHydratedHistoryRef.current = messages.length > 0;
  }, [messages]);

  useEffect(() => {
    hasHydratedHistoryRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (lastFailedInput) {
      const frame = requestAnimationFrame(() => setInput(lastFailedInput));
      clearLastFailedInput();
      return () => cancelAnimationFrame(frame);
    }
  }, [lastFailedInput, clearLastFailedInput]);

  useEffect(() => {
    if (!isMessagesLoading) return;
    const resetFrame = requestAnimationFrame(() => setLoadingTimedOut(false));
    const timer = setTimeout(() => setLoadingTimedOut(true), 1800);
    return () => {
      cancelAnimationFrame(resetFrame);
      clearTimeout(timer);
    };
  }, [isMessagesLoading]);

  const showLoading =
    isMessagesLoading && !loadingTimedOut && messages.length === 0;

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    const content = input.trim();
    setInput("");
    await sendMessage(projectId, content);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    textareaRef.current?.focus();
  };

  return (
    <div className="h-full bg-transparent" style={{ transform: "translateZ(0)" }}>
      <Card className="h-full overflow-hidden rounded-2xl border border-[var(--project-border)] bg-[var(--project-surface)] text-[var(--project-text-primary)] shadow-lg backdrop-blur-xl will-change-[box-shadow,transform]">
        <CardHeader
          className="flex flex-row items-center justify-between px-4 py-0 shrink-0 space-y-0"
          style={{ height: "52px" }}
        >
          <div className="min-w-0 flex-1 flex-col justify-center">
            <CardTitle className="text-sm font-semibold leading-tight">Chat</CardTitle>
            <CardDescription className="text-xs leading-tight text-[var(--project-text-muted)]">
              AI 助手对话
            </CardDescription>
          </div>
          {isSending ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 text-xs text-[var(--project-text-muted)]"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>思考中</span>
            </motion.div>
          ) : null}
        </CardHeader>

        <CardContent className="h-[calc(100%-132px)] p-0">
          <ScrollArea className="h-full px-4">
            <AnimatePresence mode="wait">
              {showLoading ? (
                <motion.div
                  key="chat-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="h-full py-4"
                >
                  <div className="space-y-4">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex gap-3",
                          idx % 2 === 0 ? "justify-start" : "justify-end"
                        )}
                      >
                        <div className="h-8 w-8 shrink-0 animate-pulse rounded-xl bg-[var(--project-surface-muted)]" />
                        <div className="w-[75%] space-y-2">
                          <div className="h-3 animate-pulse rounded bg-[var(--project-surface-muted)]" />
                          <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--project-surface-muted)]" />
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : messages.length === 0 ? (
                <motion.div
                  key="chat-empty"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="flex h-full flex-col items-center justify-center py-8 text-center"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -10 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--project-surface-muted)] shadow-sm"
                  >
                    <Sparkles className="h-7 w-7 text-[var(--project-text-muted)]" />
                  </motion.div>
                  <p className="text-sm font-semibold text-[var(--project-text-primary)]">
                    开始对话
                  </p>
                  <p className="mb-4 mt-1 text-xs text-[var(--project-text-muted)]">
                    向 AI 助手提问关于项目的内容
                  </p>
                  <div className="flex max-w-[280px] flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="rounded-full bg-[var(--project-surface-muted)] px-3 py-1.5 text-xs font-medium text-[var(--project-text-muted)] transition-colors hover:bg-[var(--project-surface)]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="chat-messages"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4 py-4"
                >
                  <AnimatePresence mode="popLayout">
                    {messages.map((message, index) => (
                      <MessageBubble
                        key={message.id}
                        message={message as ChatMessage}
                        index={index}
                        projectId={projectId}
                      />
                    ))}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </ScrollArea>
        </CardContent>

        <CardFooter className="flex-col gap-2 border-t border-[var(--project-border)] px-4 py-3">
          <div className="flex w-full items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              className="min-h-[44px] max-h-[120px] resize-none rounded-xl border-[var(--project-border)] bg-[var(--project-surface-elevated)] transition-colors focus:border-[var(--project-border-strong)] focus:ring-[var(--project-border)]"
              rows={1}
            />
            <Button
              size="icon"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isSending}
              className={cn(
                "h-11 w-11 shrink-0 rounded-xl transition-all duration-200",
                input.trim() && !isSending
                  ? "bg-[var(--project-accent)] text-[var(--project-accent-text)] shadow-md hover:bg-[var(--project-accent-hover)] hover:shadow-lg"
                  : "bg-[var(--project-surface-muted)] text-[var(--project-text-muted)]"
              )}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="w-full text-center text-[10px] text-[var(--project-text-muted)]">
            按 Enter 发送，Shift + Enter 换行
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

