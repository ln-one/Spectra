"use client";

import { useEffect, useState, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";
import { MessageList } from "@/components/MessageList";
import { MessageInput } from "@/components/MessageInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { cn } from "@/lib/utils";

interface ChatInterfaceProps {
  projectId: string;
  className?: string;
}

export function ChatInterface({ projectId, className }: ChatInterfaceProps) {
  const {
    messages,
    isTyping,
    isLoading,
    error,
    sendMessage,
    sendVoiceMessage,
    fetchMessages,
    clearMessages,
    clearError,
  } = useChatStore();

  const [hasLoaded, setHasLoaded] = useState(false);

  // 使用 useCallback 包装 fetchMessages 以稳定引用
  const handleFetchMessages = useCallback(() => {
    if (projectId && !hasLoaded) {
      fetchMessages(projectId);
      setHasLoaded(true);
    }
  }, [projectId, hasLoaded, fetchMessages]);

  useEffect(() => {
    handleFetchMessages();
  }, [handleFetchMessages]);

  useEffect(() => {
    return () => {
      clearMessages();
    };
  }, [clearMessages]);

  const handleSend = async (content: string) => {
    if (error) {
      clearError();
    }
    await sendMessage(projectId, content);
  };

  const handleVoiceRecord = async (audioBlob: Blob) => {
    await sendVoiceMessage(projectId, audioBlob);
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">加载中...</div>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      {isTyping && <TypingIndicator />}

      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-sm">{error}</div>
      )}

      <MessageInput
        onSend={handleSend}
        onVoiceRecord={handleVoiceRecord}
        disabled={isTyping}
      />
    </div>
  );
}
