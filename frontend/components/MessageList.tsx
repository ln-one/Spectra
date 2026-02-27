"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Message } from "@/lib/api/chat";

interface MessageListProps {
  messages: Message[];
  className?: string;
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UserAvatar({ className }: { className?: string }) {
  return (
    <Avatar className={cn("h-8 w-8", className)}>
      <AvatarImage src="" />
      <AvatarFallback className="bg-blue-500 text-white text-sm">
        用
      </AvatarFallback>
    </Avatar>
  );
}

function AIAvatar({ className }: { className?: string }) {
  return (
    <Avatar className={cn("h-8 w-8", className)}>
      <AvatarImage src="" />
      <AvatarFallback className="bg-green-500 text-white text-sm">
        AI
      </AvatarFallback>
    </Avatar>
  );
}

export function MessageList({ messages, className }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div
        className={cn(
          "flex-1 flex items-center justify-center text-gray-400",
          className
        )}
      >
        <div className="text-center">
          <AIAvatar className="h-12 w-12 mx-auto mb-4" />
          <p>您好！我是您的课件助手</p>
          <p className="text-sm mt-2">请告诉我您想创建什么样的课件</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex-1 overflow-y-auto p-4 space-y-4", className)}>
      {messages.map((message) => {
        const isUser = message.role === "user";

        return (
          <div
            key={message.id}
            className={cn("flex gap-3", isUser ? "flex-row" : "flex-row")}
          >
            {isUser ? <UserAvatar /> : <AIAvatar />}
            <div
              className={cn(
                "max-w-[70%] rounded-lg px-4 py-2",
                isUser ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-900"
              )}
            >
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
              <div
                className={cn(
                  "text-xs mt-1",
                  isUser ? "text-blue-100" : "text-gray-400"
                )}
              >
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
