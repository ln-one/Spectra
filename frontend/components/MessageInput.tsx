"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSend: (message: string) => void;
  onVoiceRecord?: (audioBlob: Blob) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function MessageInput({
  onSend,
  onVoiceRecord,
  disabled = false,
  placeholder = "输入消息... (Enter 发送, Shift+Enter 换行)",
  className,
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage("");
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceRecord = (audioBlob: Blob) => {
    if (onVoiceRecord) {
      onVoiceRecord(audioBlob);
    }
  };

  return (
    <div className={cn("border-t bg-white p-4", className)}>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="min-h-[44px] max-h-[200px] resize-none py-3"
          />
        </div>

        <div className="flex items-center gap-1">
          {onVoiceRecord && (
            <VoiceRecorder
              onRecordComplete={handleVoiceRecord}
              className="mb-0.5"
            />
          )}

          <Button
            type="submit"
            size="icon"
            onClick={handleSend}
            disabled={disabled || !message.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
