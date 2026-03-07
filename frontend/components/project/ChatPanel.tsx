"use client";

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Loader2, ExternalLink } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Message, SourceReference } from "@/lib/api/chat";

interface ChatPanelProps {
  projectId: string;
}

function MessageBubble({ message, index }: { message: Message; index: number }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 30 }}
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-zinc-900" : "bg-zinc-100"
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-zinc-600" />
        )}
      </div>

      <div className={cn("flex flex-col gap-1.5 max-w-[75%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
            isUser
              ? "bg-zinc-900 text-white rounded-tr-md"
              : "bg-zinc-100 text-zinc-800 rounded-tl-md"
          )}
        >
          {message.content}
        </div>

        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {message.citations.map((citation, i) => (
              <CitationBadge key={`${citation.chunk_id}-${i}`} citation={citation} />
            ))}
          </div>
        )}

        <span className="text-[10px] text-zinc-400 px-1">
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </motion.div>
  );
}

function CitationBadge({ citation }: { citation: SourceReference }) {
  return (
    <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[10px] font-normal cursor-pointer hover:bg-zinc-100">
      <ExternalLink className="w-3 h-3" />
      <span className="truncate max-w-[100px]">{citation.filename}</span>
      {citation.page_number && <span className="text-zinc-400">P{citation.page_number}</span>}
    </Badge>
  );
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const { messages, isSending, sendMessage } = useProjectStore();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    const content = input.trim();
    setInput("");
    await sendMessage(projectId, content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="h-full rounded-none border-0 shadow-none">
      <CardHeader className="px-4 py-3 space-y-0">
        <CardTitle className="text-sm">Chat</CardTitle>
        <CardDescription className="text-xs">AI 助手对话</CardDescription>
      </CardHeader>

      <CardContent className="p-0 h-[calc(100%-120px)]">
        <ScrollArea className="h-full px-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
                <Bot className="w-7 h-7 text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-700">开始对话</p>
              <p className="text-xs text-zinc-500 mt-1">向 AI 助手提问关于项目的问题</p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <AnimatePresence mode="popLayout">
                {messages.map((message, index) => (
                  <MessageBubble key={message.id} message={message} index={index} />
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <CardFooter className="px-4 py-3 border-t border-gray-100 flex-col gap-2">
        <div className="flex items-end gap-2 w-full">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            className="min-h-[44px] max-h-[120px] resize-none rounded-2xl bg-zinc-50 border-zinc-200 focus:border-zinc-300"
            rows={1}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className={cn(
              "shrink-0 rounded-xl w-11 h-11",
              input.trim() && !isSending
                ? "bg-zinc-900 hover:bg-zinc-800"
                : "bg-zinc-100 text-zinc-400"
            )}
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-zinc-400 text-center w-full">
          按 Enter 发送，Shift + Enter 换行
        </p>
      </CardFooter>
    </Card>
  );
}
