"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Sparkles,
  FileText,
  Settings,
  History,
  Bot,
  ChevronRight,
  FolderOpen,
} from "lucide-react";

type ViewMode = "chat" | "generate" | "preview";

interface StudioPanelProps {
  projectId: string;
  currentMode?: ViewMode;
  onModeChange?: (mode: ViewMode) => void;
}

interface ToolItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

interface HistoryItem {
  id: string;
  title: string;
  timestamp: string;
}

export function StudioPanel({
  projectId,
  currentMode = "chat",
  onModeChange,
}: StudioPanelProps) {
  const router = useRouter();
  const [expandedSection, setExpandedSection] = useState<string | null>("tools");

  // 工具列表
  const tools: ToolItem[] = [
    {
      id: "chat",
      label: "AI 对话",
      icon: <MessageSquare className="h-5 w-5" />,
      href: `/projects/${projectId}`,
    },
    {
      id: "generate",
      label: "生成课件",
      icon: <Sparkles className="h-5 w-5" />,
      href: `/projects/${projectId}/generate`,
    },
    {
      id: "preview",
      label: "预览下载",
      icon: <FileText className="h-5 w-5" />,
      href: `/projects/${projectId}/preview`,
    },
    {
      id: "settings",
      label: "项目设置",
      icon: <Settings className="h-5 w-5" />,
      href: `/projects/${projectId}/settings`,
    },
  ];

  // 模拟历史记录数据（后续可从 API 获取）
  const recentHistory: HistoryItem[] = [
    { id: "1", title: "关于二次函数的课件", timestamp: "2024-01-15" },
    { id: "2", title: "化学实验总结", timestamp: "2024-01-14" },
    { id: "3", title: "英语语法讲解", timestamp: "2024-01-13" },
  ];

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const handleToolClick = (tool: ToolItem) => {
    onModeChange?.(tool.id as ViewMode);
    router.push(tool.href);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 标题区域 */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6" />
          <span className="font-semibold">Studio</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* 工具栏 */}
          <div className="mb-4">
            <button
              onClick={() => toggleSection("tools")}
              className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium hover:bg-accent rounded-md"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                工具
              </span>
              <ChevronRight
                className={`h-4 w-4 transition-transform ${
                  expandedSection === "tools" ? "rotate-90" : ""
                }`}
              />
            </button>
            {expandedSection === "tools" && (
              <div className="mt-1 space-y-1">
                {tools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => handleToolClick(tool)}
                    className={`flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors ${
                      currentMode === tool.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    }`}
                  >
                    {tool.icon}
                    {tool.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Separator className="my-4" />

          {/* 历史记录 */}
          <div className="mb-4">
            <button
              onClick={() => toggleSection("history")}
              className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium hover:bg-accent rounded-md"
            >
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" />
                历史记录
              </span>
              <ChevronRight
                className={`h-4 w-4 transition-transform ${
                  expandedSection === "history" ? "rotate-90" : ""
                }`}
              />
            </button>
            {expandedSection === "history" && (
              <div className="mt-1 space-y-1">
                {recentHistory.map((item) => (
                  <button
                    key={item.id}
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent text-left"
                  >
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.timestamp}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Separator className="my-4" />

          {/* 快捷操作 */}
          <div className="px-3">
            <p className="text-xs text-muted-foreground mb-2">快捷操作</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => router.push(`/projects/${projectId}/generate`)}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              快速生成
            </Button>
          </div>
        </div>
      </ScrollArea>

      {/* 底部区域 */}
      <div className="p-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => router.push("/projects")}
        >
          <FolderOpen className="h-4 w-4 mr-2" />
          返回项目列表
        </Button>
      </div>
    </div>
  );
}
