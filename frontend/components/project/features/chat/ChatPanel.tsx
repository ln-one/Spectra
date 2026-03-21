"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
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

const CHAT_DESCRIPTION = "AI \u52a9\u624b\u5bf9\u8bdd";
const THINKING_LABEL = "\u601d\u8003\u4e2d";
const EMPTY_TITLE = "\u5f00\u59cb\u5bf9\u8bdd";
const EMPTY_DESCRIPTION =
  "\u5411 AI \u52a9\u624b\u63d0\u95ee\u5173\u4e8e\u9879\u76ee\u7684\u5185\u5bb9";
const INPUT_PLACEHOLDER = "\u8f93\u5165\u6d88\u606f...";

export function ChatPanel({ projectId }: ChatPanelProps) {
  const {
    messages,
    activeSessionId,
    isMessagesLoading,
    isSending,
    sendMessage,
    lastFailedInput,
    clearLastFailedInput,
  } = useProjectStore(
    useShallow((state) => ({
      messages: state.messages,
      activeSessionId: state.activeSessionId,
      isMessagesLoading: state.isMessagesLoading,
      isSending: state.isSending,
      sendMessage: state.sendMessage,
      lastFailedInput: state.lastFailedInput,
      clearLastFailedInput: state.clearLastFailedInput,
    }))
  );

  const [input, setInput] = useState("");
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [isSessionTransitioning, setIsSessionTransitioning] = useState(true);
  const [hasResolvedInitialLoad, setHasResolvedInitialLoad] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasHydratedHistoryRef = useRef(false);
  const pendingSessionIdRef = useRef<string | null>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  const transitionStartedAtRef = useRef(0);
  const wasMessagesLoadingRef = useRef(false);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    const behavior =
      hasHydratedHistoryRef.current && messages.length > 0 ? "smooth" : "auto";
    messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    hasHydratedHistoryRef.current = messages.length > 0;
  }, [messages]);

  useEffect(() => {
    hasHydratedHistoryRef.current = false;
    setLoadedSessionId(null);
    pendingSessionIdRef.current = null;
    previousSessionIdRef.current = null;
    transitionStartedAtRef.current = Date.now();
    setIsSessionTransitioning(true);
    setHasResolvedInitialLoad(false);
    wasMessagesLoadingRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (previousSessionIdRef.current !== activeSessionId) {
      previousSessionIdRef.current = activeSessionId;
      transitionStartedAtRef.current = Date.now();
      setIsSessionTransitioning(true);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (lastFailedInput) {
      const frame = requestAnimationFrame(() => setInput(lastFailedInput));
      clearLastFailedInput();
      return () => cancelAnimationFrame(frame);
    }
  }, [lastFailedInput, clearLastFailedInput]);

  useEffect(() => {
    if (isMessagesLoading) {
      pendingSessionIdRef.current = activeSessionId ?? null;
      setLoadingTimedOut(false);
      const timer = setTimeout(() => setLoadingTimedOut(true), 1800);
      return () => {
        clearTimeout(timer);
      };
    }

    if (pendingSessionIdRef.current !== null || activeSessionId === null) {
      setLoadedSessionId(pendingSessionIdRef.current ?? activeSessionId ?? null);
      pendingSessionIdRef.current = null;
    }

    if (isSessionTransitioning) {
      const elapsed = Date.now() - transitionStartedAtRef.current;
      const remaining = Math.max(0, 220 - elapsed);
      const timer = setTimeout(() => {
        setIsSessionTransitioning(false);
      }, remaining);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, isMessagesLoading]);

  useEffect(() => {
    if (activeSessionId !== loadedSessionId) {
      setLoadingTimedOut(false);
    }
  }, [activeSessionId, loadedSessionId]);

  useEffect(() => {
    if (isMessagesLoading) {
      wasMessagesLoadingRef.current = true;
    } else if (wasMessagesLoadingRef.current || messages.length > 0) {
      setHasResolvedInitialLoad(true);
    }
  }, [isMessagesLoading, messages.length]);

  useEffect(() => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 176);
    textarea.style.height = `${Math.max(nextHeight, 44)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 176 ? "auto" : "hidden";
  }, [input]);

  const awaitingSessionFirstLoad =
    !!activeSessionId &&
    messages.length === 0 &&
    loadedSessionId !== activeSessionId;
  const shouldBlockEmptyState = !hasResolvedInitialLoad && messages.length === 0;
  const showLoading =
    isSessionTransitioning ||
    shouldBlockEmptyState ||
    (isMessagesLoading && !loadingTimedOut) ||
    awaitingSessionFirstLoad;

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    const content = input.trim();
    setInput("");
    await sendMessage(projectId, content);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
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
    <div
      className="project-panel-root h-full bg-transparent"
      style={{ transform: "translateZ(0)" }}
    >
      <Card className="project-panel-card project-chat-panel h-full overflow-hidden rounded-2xl border border-[var(--project-border)] bg-[var(--project-surface)] text-[var(--project-text-primary)] shadow-lg backdrop-blur-xl will-change-[box-shadow,transform]">
        <CardHeader
          className="project-panel-header flex shrink-0 flex-row items-center justify-between space-y-0 overflow-hidden px-4 py-0"
          style={{ height: "52px" }}
        >
          <div className="min-w-0 flex-1 flex-col justify-center">
            <CardTitle className="text-sm font-semibold leading-tight">
              Chat
            </CardTitle>
            <CardDescription className="text-xs leading-tight text-[var(--project-text-muted)]">
              {CHAT_DESCRIPTION}
            </CardDescription>
          </div>
          {isSending ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 text-xs text-[var(--project-text-muted)]"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{THINKING_LABEL}</span>
            </motion.div>
          ) : null}
        </CardHeader>

        <CardContent className="relative h-[calc(100%-52px)] overflow-hidden p-0">
          <div
            className="project-chat-fade-top pointer-events-none absolute inset-x-0 top-0 z-10 h-7"
            style={{
              background:
                "linear-gradient(180deg, var(--project-surface) 0%, color-mix(in srgb, var(--project-surface) 96%, transparent) 28%, color-mix(in srgb, var(--project-surface) 84%, transparent) 52%, color-mix(in srgb, var(--project-surface) 62%, transparent) 72%, color-mix(in srgb, var(--project-surface) 36%, transparent) 88%, rgba(255,255,255,0) 100%)",
            }}
          />
          <div
            className="project-chat-fade-bottom pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[42px]"
            style={{
              background:
                "linear-gradient(0deg, var(--project-surface) 0%, color-mix(in srgb, var(--project-surface) 78%, transparent) 52%, rgba(255,255,255,0) 100%)",
            }}
          />

          <ScrollArea className="h-full px-4">
            <AnimatePresence mode="wait">
              {messages.length === 0 && !showLoading ? (
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
                    className="project-empty-icon mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--project-surface-muted)] shadow-sm"
                  >
                    <Sparkles className="h-7 w-7 text-[var(--project-text-muted)]" />
                  </motion.div>
                  <p className="text-sm font-semibold text-[var(--project-text-primary)]">
                    {EMPTY_TITLE}
                  </p>
                  <p className="mb-4 mt-1 text-xs text-[var(--project-text-muted)]">
                    {EMPTY_DESCRIPTION}
                  </p>
                  <div className="flex max-w-[280px] flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="project-chat-suggestion rounded-full bg-[var(--project-surface-muted)] px-3 py-1.5 text-xs font-medium text-[var(--project-text-muted)] transition-colors hover:bg-[var(--project-surface)]"
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
                  className="space-y-4 py-4 pb-28"
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

          <AnimatePresence>
            {showLoading ? (
              <motion.div
                key="chat-loading-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="project-chat-loading-overlay absolute inset-0 z-30 flex items-center justify-center bg-background/38 backdrop-blur-[6px]"
              >
                <motion.div
                  initial={{ scale: 0.97, opacity: 0.9 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="project-chat-loading-shell relative flex h-20 w-20 items-center justify-center rounded-3xl border border-border/55 bg-background/76 shadow-[0_14px_36px_-24px_rgba(0,0,0,0.6)]"
                >
                  <motion.div
                    className="project-chat-loading-spinner absolute h-10 w-10 rounded-full border-2 border-foreground/25 border-t-foreground/70"
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 0.9,
                      ease: "linear",
                      repeat: Infinity,
                    }}
                  />
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="pointer-events-none absolute inset-x-4 bottom-3 z-20">
            <div className="project-chat-input-shell pointer-events-auto rounded-[var(--project-input-radius)] border border-[var(--project-border)] bg-[var(--project-surface-elevated)] p-2 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)] backdrop-blur-xl">
              <div className="flex w-full items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={INPUT_PLACEHOLDER}
                  className="min-h-[44px] max-h-[176px] resize-none rounded-[var(--project-input-radius)] border-none bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  rows={1}
                />
                <Button
                  size="icon"
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || isSending}
                  className={cn(
                    "project-chat-send-btn h-10 w-10 shrink-0 rounded-[var(--project-input-radius)] transition-all duration-200",
                    input.trim() && !isSending
                      ? "bg-[var(--project-accent)] text-[var(--project-accent-text)] hover:bg-[var(--project-accent-hover)]"
                      : "bg-[var(--project-surface-muted)] text-[var(--project-text-muted)]"
                  )}
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

