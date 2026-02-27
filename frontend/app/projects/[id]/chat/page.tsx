"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { chatApi, projectsApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { Send, ChevronLeft, FileText, Loader2 } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    chunk_id: string;
    filename: string;
    page_number?: number;
    preview_text: string;
  }>;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

export default function ProjectChatPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const fetchProject = async () => {
      try {
        const res = await projectsApi.getProject(projectId);
        const projectData = res.data.project;
        if (projectData) {
          setProject(projectData);
        }
      } catch (error) {
        console.error("Failed to fetch project:", error);
      }
    };

    fetchProject();
  }, [projectId, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await chatApi.sendMessage({
        project_id: projectId,
        content: userMessage.content,
      });

      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content: response.data.message?.content || "",
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: "assistant",
        content: "抱歉，发生了错误，请稍后重试。",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceRecordComplete = useCallback(
    async (audioBlob: Blob) => {
      setIsLoading(true);

      try {
        const file = new File([audioBlob], "voice message", {
          type: "audio/webm",
        });
        const response = await chatApi.sendVoiceMessage(file, projectId);

        if (response.success && response.data.text) {
          const userMessage: Message = {
            id: `msg-${Date.now()}`,
            role: "user",
            content: response.data.text,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, userMessage]);

          if (response.data.message) {
            const assistantMessage: Message = {
              id: `msg-${Date.now()}-assistant`,
              role: "assistant",
              content: response.data.message.content || "",
              created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }
        }
      } catch (error) {
        console.error("Failed to process voice message:", error);
        const errorMessage: Message = {
          id: `msg-${Date.now()}-error`,
          role: "assistant",
          content: "语音识别失败，请重试或使用文字输入。",
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/projects/${projectId}`)}
            className="mb-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            返回
          </Button>
          <h2 className="font-semibold truncate">{project?.name || "项目"}</h2>
        </div>
        <div className="p-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push(`/projects/${projectId}/preview`)}
          >
            <FileText className="mr-2 h-4 w-4" />
            查看预览
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <div className="border-b p-4">
          <h1 className="text-lg font-semibold">对话</h1>
          <p className="text-sm text-muted-foreground">
            与 AI 助手描述您的教学需求
          </p>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  描述您想要创建的教学内容，AI 助手会帮您完善需求
                </p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>例如：</p>
                  <p>• "我想创建一二次函数课程"</p>
                  节初中数学的 <p>• "需要包含图像、顶点公式讲解和例题"</p>
                  <p>• "大约15分钟的教学时长"</p>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <Card
                  className={`max-w-[80%] ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <div className="p-4">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border">
                        <p className="text-opacity-20-xs opacity-70 mb-2">
                          参考来源：
                        </p>
                        <div className="space-y-1">
                          {message.sources.map((source, idx) => (
                            <p key={idx} className="text-xs opacity-70">
                              • {source.filename}
                              {source.page_number &&
                                ` (第${source.page_number}页)`}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-xs opacity-50 mt-2">
                      {new Date(message.created_at).toLocaleTimeString("zh-CN")}
                    </p>
                  </div>
                </Card>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <Card className="bg-muted">
                  <div className="p-4 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      AI 正在思考...
                    </span>
                  </div>
                </Card>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <VoiceRecorder onRecordComplete={handleVoiceRecordComplete} />
            <Input
              ref={inputRef}
              placeholder="输入您的教学需求..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={!input.trim() || isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
