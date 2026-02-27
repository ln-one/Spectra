"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { previewApi } from "@/lib/api";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

interface ModifyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ModifyChatProps {
  taskId: string;
  slideIds?: string[];
  className?: string;
  onModifyComplete?: () => void;
}

export function ModifyChat({
  taskId,
  slideIds,
  className,
  onModifyComplete,
}: ModifyChatProps) {
  const [messages, setMessages] = useState<ModifyMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `您好！我是课件修改助手。请告诉我您想要如何修改课件内容。

## 示例

- **修改第3页的标题** → "将第3页的标题改为《光的折射》"
- **在第5页添加例子** → "在第5页添加2个生活中的折射例子"
- **调整页面样式** → "将所有页面的背景色改为淡蓝色"

## 支持的格式

| 功能 | 语法 |
|------|------|
| 重点 | \`**文字**\` |
| 代码 | \`\`\`代码\`\`\` |
| 列表 | \`- 项目\` |

请描述您的修改需求，我会为您生成修改后的课件。`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ModifyMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await previewApi.modifyPreview(taskId, {
        instruction: userMessage.content,
        target_slides: slideIds,
      });

      const assistantMessage: ModifyMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.message || "修改任务已提交成功！系统正在处理您的修改请求，请稍候。",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (response.data?.status === "completed") {
        onModifyComplete?.();
      }
    } catch {
      const errorMessage: ModifyMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "抱歉，提交修改请求时出现错误。请稍后重试。",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4" />
          修改指令
        </h3>
        <p className="text-sm text-muted-foreground">
          描述您想要修改的内容
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4" ref={scrollRef}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {message.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-2",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {message.role === "assistant" ? (
                  <MarkdownRenderer content={message.content} className="text-sm" />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                )}
                <p className="text-xs opacity-50 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">正在提交修改请求...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <CardContent className="pt-4 border-t">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述您的修改需求..."
            className="min-h-[80px] resize-none"
            disabled={isLoading}
          />
        </div>
        <div className="flex justify-end mt-2">
          <Button onClick={handleSubmit} disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                提交修改
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ModifyChat;
