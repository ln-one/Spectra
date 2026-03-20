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
      <Card className="h-full rounded-2xl shadow-lg border border-white/60 bg-white/95 backdrop-blur-xl overflow-hidden will-change-[box-shadow,transform]">
        <CardHeader
          className="flex flex-row items-center justify-between px-4 space-y-0 py-0 shrink-0"
          style={{ height: "52px" }}
        >
          <div className="flex flex-col justify-center min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold leading-tight">Chat</CardTitle>
            <CardDescription className="text-xs text-zinc-500 leading-tight">
              AI 助手对话
            </CardDescription>
          </div>
          {isSending ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 text-xs text-zinc-500"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>思考中</span>
            </motion.div>
          ) : null}
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-132px)]">
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
                        <div className="w-8 h-8 rounded-xl bg-zinc-100 animate-pulse shrink-0" />
                        <div className="space-y-2 w-[75%]">
                          <div className="h-3 rounded bg-zinc-100 animate-pulse" />
                          <div className="h-3 w-4/5 rounded bg-zinc-100 animate-pulse" />
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
                  className="h-full flex flex-col items-center justify-center text-center py-8"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -10 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="w-14 h-14 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center mb-4 shadow-sm"
                  >
                    <Sparkles className="w-7 h-7 text-zinc-500" />
                  </motion.div>
                  <p className="text-sm font-semibold text-zinc-700">开始对话</p>
                  <p className="text-xs text-zinc-500 mt-1 mb-4">
                    向 AI 助手提问关于项目的问题
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center max-w-[280px]">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="px-3 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors"
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

        <CardFooter className="px-4 py-3 border-t border-zinc-100 flex-col gap-2">
          <div className="flex items-end gap-2 w-full">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              className="min-h-[44px] max-h-[120px] resize-none rounded-xl bg-zinc-50 border-zinc-200 focus:border-zinc-400 focus:ring-zinc-200 transition-colors"
              rows={1}
            />
            <Button
              size="icon"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isSending}
              className={cn(
                "shrink-0 rounded-xl w-11 h-11 transition-all duration-200",
                input.trim() && !isSending
                  ? "bg-gradient-to-br from-zinc-800 to-zinc-900 hover:from-zinc-700 hover:to-zinc-800 shadow-md hover:shadow-lg"
                  : "bg-zinc-100 text-zinc-400"
              )}
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-zinc-400 text-center w-full">
            按 Enter 发送，Shift + Enter 换行
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
