"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { TOOL_COLORS } from "@/components/project/features/studio/constants";
import type { ChatMessage } from "./types";

interface ChatPanelProps {
  projectId: string;
}

const CHAT_DESCRIPTION = "AI 助手对话";
const THINKING_LABEL = "思考中";
const EMPTY_TITLE = "开始对话";
const EMPTY_DESCRIPTION = "向 AI 助手提问关于项目的内容";
const INPUT_PLACEHOLDER = "输入消息...";
const NO_SESSION_PLACEHOLDER = "请先在会话选择器中点击“新建会话”";
const REFINE_PLACEHOLDER = "例如：再详细一点 / 增加案例 / 更简洁";

export function ChatPanel({
  projectId,
  ...props
}: ChatPanelProps & React.HTMLAttributes<HTMLDivElement>) {
  const {
    messages,
    localToolMessages,
    studioChatContext,
    chatComposerFocusSignal,
    activeSessionId,
    isMessagesLoading,
    isSending,
    isStudioRefining,
    sendMessage,
    sendStudioRefineMessage,
    hydrateStudioLocalState,
    lastFailedInput,
    clearLastFailedInput,
  } = useProjectStore(
    useShallow((state) => ({
      messages: state.messages,
      localToolMessages: state.localToolMessages,
      studioChatContext: state.studioChatContext,
      chatComposerFocusSignal: state.chatComposerFocusSignal,
      activeSessionId: state.activeSessionId,
      isMessagesLoading: state.isMessagesLoading,
      isSending: state.isSending,
      isStudioRefining: state.isStudioRefining,
      sendMessage: state.sendMessage,
      sendStudioRefineMessage: state.sendStudioRefineMessage,
      hydrateStudioLocalState: state.hydrateStudioLocalState,
      lastFailedInput: state.lastFailedInput,
      clearLastFailedInput: state.clearLastFailedInput,
    }))
  );

  const [input, setInput] = useState("");
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [isSessionTransitioning, setIsSessionTransitioning] = useState(true);
  const [hasResolvedInitialLoad, setHasResolvedInitialLoad] = useState(false);
  const [composerClearance, setComposerClearance] = useState(120);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerShellRef = useRef<HTMLDivElement>(null);
  const hasHydratedHistoryRef = useRef(false);
  const pendingSessionIdRef = useRef<string | null>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  const transitionStartedAtRef = useRef(0);
  const wasMessagesLoadingRef = useRef(false);

  const localSessionMessages = useMemo(() => {
    if (!activeSessionId) return [];
    return localToolMessages[projectId]?.[activeSessionId] ?? [];
  }, [activeSessionId, localToolMessages, projectId]);

  const mergedMessages = useMemo<ChatMessage[]>(() => {
    const merged = [...messages, ...localSessionMessages] as ChatMessage[];
    const uniqueById = new Map<string, ChatMessage>();
    merged.forEach((message) => {
      uniqueById.set(message.id, message);
    });
    return Array.from(uniqueById.values()).sort((left, right) => {
      const leftTs = Date.parse(left.timestamp);
      const rightTs = Date.parse(right.timestamp);
      const leftTime = Number.isNaN(leftTs) ? 0 : leftTs;
      const rightTime = Number.isNaN(rightTs) ? 0 : rightTs;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    });
  }, [localSessionMessages, messages]);

  const isStudioRefineMode =
    Boolean(studioChatContext) &&
    studioChatContext?.projectId === projectId &&
    studioChatContext?.isRefineMode === true &&
    studioChatContext?.step === "preview" &&
    studioChatContext?.canRefine === true &&
    (!activeSessionId || studioChatContext?.sessionId === activeSessionId);

  const toolColors =
    isStudioRefineMode && studioChatContext
      ? TOOL_COLORS[studioChatContext.toolType]
      : undefined;
  const refineToolLabel = studioChatContext?.toolLabel ?? "工具卡片";
  const showThinkingIndicator = isSending && !isStudioRefineMode;

  useEffect(() => {
    hydrateStudioLocalState(projectId);
  }, [hydrateStudioLocalState, projectId]);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    const behavior =
      hasHydratedHistoryRef.current && mergedMessages.length > 0
        ? "smooth"
        : "auto";
    messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    hasHydratedHistoryRef.current = mergedMessages.length > 0;
  }, [mergedMessages]);

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
      setLoadedSessionId(
        pendingSessionIdRef.current ?? activeSessionId ?? null
      );
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
    } else if (wasMessagesLoadingRef.current || mergedMessages.length > 0) {
      setHasResolvedInitialLoad(true);
    }
  }, [isMessagesLoading, mergedMessages.length]);

  useEffect(() => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 176);
    textarea.style.height = `${Math.max(nextHeight, 44)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 176 ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    const shell = composerShellRef.current;
    if (!shell) return;

    const BOTTOM_OFFSET = 12;
    const EXTRA_GAP = 8;
    const updateClearance = () => {
      setComposerClearance(
        Math.ceil(
          shell.getBoundingClientRect().height + BOTTOM_OFFSET + EXTRA_GAP
        )
      );
    };

    updateClearance();
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateClearance);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (chatComposerFocusSignal <= 0) return;
    const frame = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    });
    return () => cancelAnimationFrame(frame);
  }, [chatComposerFocusSignal]);

  const awaitingSessionFirstLoad =
    !!activeSessionId &&
    mergedMessages.length === 0 &&
    loadedSessionId !== activeSessionId;
  const shouldBlockEmptyState =
    !hasResolvedInitialLoad && mergedMessages.length === 0;
  const showLoading =
    isSessionTransitioning ||
    shouldBlockEmptyState ||
    (isMessagesLoading && !loadingTimedOut) ||
    awaitingSessionFirstLoad;

  const handleSend = async () => {
    if (!input.trim() || !activeSessionId) return;
    if (!isStudioRefineMode && isSending) return;

    const content = input.trim();
    setInput("");

    if (isStudioRefineMode) {
      await sendStudioRefineMessage(projectId, content);
      return;
    }

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
      {...props}
    >
      <Card
        className={cn(
          "project-panel-card project-chat-panel relative h-full overflow-hidden rounded-2xl border bg-[var(--project-surface)] text-[var(--project-text-primary)] shadow-lg backdrop-blur-xl will-change-[box-shadow,transform] transition-all duration-700",
          isStudioRefineMode
            ? "border-transparent"
            : "border-[var(--project-border)]"
        )}
        style={{
          boxShadow:
            isStudioRefineMode && toolColors
              ? `0 0 0 1px ${toolColors.primary}, 0 12px 40px -12px ${toolColors.glow}`
              : undefined,
        }}
      >
        {isStudioRefineMode && toolColors && (
          <div
            className="absolute inset-x-0 top-0 h-1 z-50 animate-pulse transition-colors"
            style={{
              background: `linear-gradient(to right, ${toolColors.primary}, ${toolColors.secondary})`,
            }}
          />
        )}
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
          {showThinkingIndicator ? (
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
            className="project-chat-fade-bottom pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[42px]"
            style={{
              background:
                "linear-gradient(0deg, var(--project-surface) 0%, color-mix(in srgb, var(--project-surface) 78%, transparent) 52%, rgba(255,255,255,0) 100%)",
            }}
          />

          <ScrollArea className="h-full px-4">
            <AnimatePresence mode="wait">
              {mergedMessages.length === 0 && !showLoading ? (
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
                  className="space-y-4 py-4"
                  style={{ paddingBottom: `${composerClearance}px` }}
                >
                  <AnimatePresence mode="popLayout">
                    {mergedMessages.map((message, index) => (
                      <MessageBubble
                        key={message.id}
                        message={message as ChatMessage}
                        index={index}
                        projectId={projectId}
                      />
                    ))}
                  </AnimatePresence>
                  <div
                    ref={messagesEndRef}
                    style={{ scrollMarginBottom: `${composerClearance}px` }}
                  />
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
            <div
              ref={composerShellRef}
              className={cn(
                "project-chat-input-shell pointer-events-auto rounded-[var(--project-input-radius)] border border-[var(--project-border)] bg-[var(--project-surface-elevated)] p-2 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)] backdrop-blur-xl transition-all duration-500",
                isStudioRefineMode && "border-transparent"
              )}
              style={
                isStudioRefineMode && toolColors
                  ? {
                      background: `color-mix(in srgb, ${toolColors.primary} 6%, var(--project-surface-elevated))`,
                      boxShadow: `0 0 0 1px ${toolColors.primary}, 0 8px 24px -18px color-mix(in srgb, ${toolColors.primary} 40%, rgba(15,23,42,0.38))`,
                    }
                  : undefined
              }
            >
              {isStudioRefineMode && toolColors ? (
                <div
                  className="mb-1.5 flex items-center justify-between gap-2 rounded-[calc(var(--project-input-radius)-4px)] px-2 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: toolColors.soft,
                    color: toolColors.primary,
                    border: `1px solid ${toolColors.glow}`,
                  }}
                >
                  <span className="truncate flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    正在微调：{refineToolLabel}
                  </span>
                  {isStudioRefining ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="shrink-0 opacity-80">
                      发送后会按顺序处理
                    </span>
                  )}
                </div>
              ) : null}
              <div className="flex w-full items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    activeSessionId
                      ? isStudioRefineMode
                        ? REFINE_PLACEHOLDER
                        : INPUT_PLACEHOLDER
                      : NO_SESSION_PLACEHOLDER
                  }
                  disabled={!activeSessionId}
                  className="min-h-[44px] max-h-[176px] resize-none rounded-[var(--project-input-radius)] border-none bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  rows={1}
                />
                <Button
                  size="icon"
                  onClick={() => void handleSend()}
                  disabled={
                    !input.trim() ||
                    !activeSessionId ||
                    (!isStudioRefineMode && isSending)
                  }
                  className={cn(
                    "project-chat-send-btn h-10 w-10 shrink-0 rounded-[var(--project-input-radius)] transition-all duration-200",
                    input.trim() && (isStudioRefineMode || !isSending)
                      ? isStudioRefineMode
                        ? "text-white shadow-sm hover:brightness-110 focus:ring-0"
                        : "bg-[var(--project-accent)] text-[var(--project-accent-text)] hover:bg-[var(--project-accent-hover)]"
                      : "bg-[var(--project-surface-muted)] text-[var(--project-text-muted)] border border-transparent"
                  )}
                  style={
                    input.trim() && isStudioRefineMode && toolColors
                      ? {
                          background: `linear-gradient(135deg, ${toolColors.primary}, ${toolColors.secondary})`,
                          borderColor: toolColors.primary,
                        }
                      : undefined
                  }
                >
                  {showThinkingIndicator ? (
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
