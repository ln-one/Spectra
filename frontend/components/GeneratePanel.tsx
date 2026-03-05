"use client";

import { useState, useEffect, useCallback } from "react";
import { useGenerateStore, type GenerationSession } from "@/stores/generateStore";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Presentation,
  FileText,
  Loader2,
  Palette,
  Hash,
  Film,
  Gamepad2,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// GenerationOptions 类型（与 OpenAPI 对齐）
export interface GenerateOptions {
  template?: "default" | "gaia" | "uncover" | "academic";
  style_preset?: "academic" | "vibrant" | "dark_tech" | "custom";
  theme_color?: string;
  show_page_number?: boolean;
  header?: string;
  footer?: string;
  pages?: number;
  audience?: "beginner" | "intermediate" | "professional";
  target_duration_minutes?: number;
  include_animations?: boolean;
  include_games?: boolean;
  animation_format?: "gif" | "mp4" | "html5";
  use_text_to_image?: boolean;
  system_prompt_tone?: string;
}

interface GeneratePanelProps {
  projectId: string;
  className?: string;
}

// 模板选项（带视觉预览）
const TEMPLATE_OPTIONS = [
  {
    value: "default",
    label: "默认",
    description: "简洁现代",
    preview: "from-slate-50 to-slate-100",
  },
  {
    value: "gaia",
    label: "Gaia",
    description: "自然主题",
    preview: "from-green-50 to-emerald-100",
  },
  {
    value: "uncover",
    label: "Uncover",
    description: "创意展示",
    preview: "from-purple-50 to-indigo-100",
  },
  {
    value: "academic",
    label: "Academic",
    description: "学术风格",
    preview: "from-blue-50 to-sky-100",
  },
];

// 主题色（使用新版设计规范颜色）
const THEME_COLORS = [
  { value: "#4C8C6A", label: "薄荷绿", class: "bg-[#4C8C6A]" },
  { value: "#3F83A3", label: "湖蓝", class: "bg-[#3F83A3]" },
  { value: "#D98A4E", label: "杏橙", class: "bg-[#D98A4E]" },
  { value: "#596359", label: "橄榄灰", class: "bg-[#596359]" },
  { value: "#7A857A", label: "青灰", class: "bg-[#7A857A]" },
  { value: "#C45353", label: "珊瑚红", class: "bg-[#C45353]" },
];

// Session 状态到中文的映射
const STATE_LABELS: Record<string, string> = {
  IDLE: "空闲",
  CONFIGURING: "配置中",
  ANALYZING: "分析中",
  DRAFTING_OUTLINE: "生成大纲",
  AWAITING_OUTLINE_CONFIRM: "等待确认",
  GENERATING_CONTENT: "生成内容",
  RENDERING: "渲染中",
  SUCCESS: "已完成",
  FAILED: "失败",
};

// 生成中状态列表
const GENERATING_STATES = [
  "CONFIGURING",
  "ANALYZING",
  "DRAFTING_OUTLINE",
  "AWAITING_OUTLINE_CONFIRM",
  "GENERATING_CONTENT",
  "RENDERING",
];

export function GeneratePanel({ projectId, className }: GeneratePanelProps) {
  // 使用 Session 相关的 Store 方法
  const {
    currentSession,
    sessions,
    isLoading,
    error,
    createSession,
    getSession,
    connectSessionEvents,
    disconnectSessionEvents,
    setCurrentSession,
    clearSessions,
  } = useGenerateStore();

  const { toast } = useToast();

  // 本地状态
  const [selectedMode, setSelectedMode] = useState<"ppt" | "word" | "both">("ppt");
  const [options, setOptions] = useState<GenerateOptions>({
    template: "default",
    theme_color: "#4C8C6A",
    show_page_number: true,
    pages: 10,
    include_animations: false,
    include_games: false,
    use_text_to_image: false,
  });

  // SSE 事件监听
  useEffect(() => {
    if (!currentSession?.sessionId) return;

    const unsubscribe = connectSessionEvents(
      currentSession.sessionId,
      (event) => {
        console.log("Session event:", event);
        // 根据事件更新状态
        if (event.event_type === "state.changed") {
          getSession(currentSession.sessionId);
        } else if (event.event_type === "task.completed") {
          getSession(currentSession.sessionId);
          toast({
            title: "生成完成",
            description: "课件已生成完成，您可以下载了",
          });
        } else if (event.event_type === "task.failed") {
          getSession(currentSession.sessionId);
          toast({
            title: "生成失败",
            description: "请重试或联系支持",
            variant: "destructive",
          });
        }
      },
      (error) => {
        console.error("SSE error:", error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentSession?.sessionId, connectSessionEvents, getSession, toast]);

  // 判断生成状态
  const isGenerating = currentSession
    ? GENERATING_STATES.includes(currentSession.state)
    : false;
  const isCompleted = currentSession?.state === "SUCCESS";
  const isFailed = currentSession?.state === "FAILED";

  // 开始生成
  const handleStartGenerate = async () => {
    try {
      // 创建会话
      const session = await createSession(projectId, selectedMode, {
        template: options.template || "default",
        theme_color: options.theme_color,
        show_page_number: options.show_page_number ?? true,
        header: options.header,
        footer: options.footer,
        pages: options.pages,
        include_animations: options.include_animations ?? false,
        include_games: options.include_games ?? false,
        animation_format: options.animation_format,
        use_text_to_image: options.use_text_to_image ?? false,
      });

      toast({
        title: "开始生成",
        description: "正在创建生成会话...",
      });
    } catch (error) {
      toast({
        title: "生成失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    }
  };

  // 取消生成（发送取消命令）
  const handleCancel = async () => {
    if (currentSession?.sessionId) {
      // TODO: 实现取消逻辑
      toast({
        title: "已取消",
        description: "生成任务已取消",
      });
    }
  };

  // 下载课件
  const handleDownload = async (fileType: "pptx" | "docx") => {
    if (!currentSession) return;
    // TODO: 实现下载逻辑
    toast({
      title: "下载功能",
      description: "下载功能开发中...",
    });
  };

  // 刷新状态
  const handleRefresh = async () => {
    if (currentSession?.sessionId) {
      await getSession(currentSession.sessionId);
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* 标题区 */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#4C8C6A]" />
          <span className="font-semibold text-[#1F2520]">课件生成</span>
        </div>
        <p className="text-xs text-[#596359] mt-1">配置生成选项，创建您的教学课件</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* 错误提示 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* 生成类型选择 */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-[#596359] uppercase tracking-wide">
              输出类型
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "ppt", label: "PPT", icon: Presentation },
                { value: "word", label: "Word", icon: FileText },
                { value: "both", label: "全部", icon: Zap },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setSelectedMode(value as typeof selectedMode)}
                  disabled={isGenerating}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all",
                    selectedMode === value
                      ? "border-[#4C8C6A] bg-[#4C8C6A]/5"
                      : "border-transparent bg-[#F6F7F5] hover:bg-[#F1F3EF]",
                    isGenerating && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      selectedMode === value ? "text-[#4C8C6A]" : "text-[#596359]"
                    )}
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      selectedMode === value ? "text-[#4C8C6A]" : "text-[#1F2520]"
                    )}
                  >
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 模板选择 */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-[#596359] uppercase tracking-wide">
              模板风格
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATE_OPTIONS.map((template) => (
                <button
                  key={template.value}
                  onClick={() =>
                    setOptions({ ...options, template: template.value as GenerateOptions["template"] })
                  }
                  disabled={isGenerating}
                  className={cn(
                    "relative p-3 rounded-lg border-2 transition-all text-left",
                    options.template === template.value
                      ? "border-[#4C8C6A] ring-1 ring-[#4C8C6A]/20"
                      : "border-[#E3E7DF] hover:border-[#4C8C6A]/50",
                    isGenerating && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {/* 模板预览 */}
                  <div
                    className={cn(
                      "h-12 rounded-md mb-2 bg-gradient-to-br",
                      template.preview
                    )}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#1F2520]">
                      {template.label}
                    </span>
                    {options.template === template.value && (
                      <CheckCircle2 className="h-4 w-4 text-[#4C8C6A]" />
                    )}
                  </div>
                  <p className="text-xs text-[#7A857A]">{template.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 主题色选择 */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-[#596359] uppercase tracking-wide">
              主题色
            </Label>
            <div className="flex gap-2">
              {THEME_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setOptions({ ...options, theme_color: color.value })}
                  disabled={isGenerating}
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    options.theme_color === color.value
                      ? "ring-2 ring-offset-2 ring-[#4C8C6A] scale-110"
                      : "hover:scale-105",
                    isGenerating && "opacity-50 cursor-not-allowed"
                  )}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
              <Input
                type="color"
                value={options.theme_color || "#4C8C6A"}
                onChange={(e) => setOptions({ ...options, theme_color: e.target.value })}
                className="w-8 h-8 p-0.5 rounded-full"
                disabled={isGenerating}
              />
            </div>
          </div>

          {/* 页数设置 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-[#596359] uppercase tracking-wide">
                期望页数
              </Label>
              <span className="text-sm text-[#1F2520]">{options.pages || 10} 页</span>
            </div>
            <Input
              type="range"
              min={1}
              max={50}
              value={options.pages || 10}
              onChange={(e) => setOptions({ ...options, pages: parseInt(e.target.value) })}
              disabled={isGenerating}
              className="accent-[#4C8C6A]"
            />
          </div>

          {/* 高级选项 */}
          <div className="space-y-3 pt-2">
            <Label className="text-xs font-medium text-[#596359] uppercase tracking-wide">
              高级选项
            </Label>

            <div className="flex items-center gap-2">
              <Checkbox
                id="showPageNumber"
                checked={options.show_page_number}
                onCheckedChange={(checked) =>
                  setOptions({ ...options, show_page_number: checked as boolean })
                }
                disabled={isGenerating}
                className="data-[state=checked]:bg-[#4C8C6A] data-[state=checked]:border-[#4C8C6A]"
              />
              <Label htmlFor="showPageNumber" className="text-sm text-[#1F2520]">
                显示页码
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="includeAnimations"
                checked={options.include_animations}
                onCheckedChange={(checked) =>
                  setOptions({ ...options, include_animations: checked as boolean })
                }
                disabled={isGenerating}
                className="data-[state=checked]:bg-[#4C8C6A] data-[state=checked]:border-[#4C8C6A]"
              />
              <Label htmlFor="includeAnimations" className="flex items-center gap-1.5 text-sm text-[#1F2520]">
                <Film className="h-4 w-4 text-[#596359]" />
                包含动画创意
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="includeGames"
                checked={options.include_games}
                onCheckedChange={(checked) =>
                  setOptions({ ...options, include_games: checked as boolean })
                }
                disabled={isGenerating}
                className="data-[state=checked]:bg-[#4C8C6A] data-[state=checked]:border-[#4C8C6A]"
              />
              <Label htmlFor="includeGames" className="flex items-center gap-1.5 text-sm text-[#1F2520]">
                <Gamepad2 className="h-4 w-4 text-[#596359]" />
                包含互动游戏
              </Label>
            </div>
          </div>

          {/* 生成进度展示 */}
          {currentSession && isGenerating && (
            <div className="space-y-3 p-4 bg-[#F6F7F5] rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#4C8C6A]" />
                  <span className="text-sm font-medium text-[#1F2520]">
                    {STATE_LABELS[currentSession.state] || "生成中"}
                  </span>
                </div>
                <span className="text-sm text-[#596359]">
                  {currentSession.progress || 0}%
                </span>
              </div>
              <Progress
                value={currentSession.progress || 0}
                className="h-1.5 bg-[#E3E7DF] [&>div]:bg-[#4C8C6A]"
              />
              <p className="text-xs text-[#7A857A]">请稍候，课件正在生成中...</p>
            </div>
          )}

          {/* 完成状态 */}
          {currentSession && isCompleted && (
            <div className="space-y-3 p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#2F8F5B]" />
                <span className="text-sm font-medium text-[#2F8F5B]">
                  生成完成
                </span>
              </div>
              <p className="text-xs text-[#596359]">课件已生成，您可以下载了</p>
              <div className="flex gap-2">
                {(selectedMode === "ppt" || selectedMode === "both") && (
                  <Button
                    size="sm"
                    onClick={() => handleDownload("pptx")}
                    className="bg-[#4C8C6A] hover:bg-[#3D7A58]"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    PPT
                  </Button>
                )}
                {(selectedMode === "word" || selectedMode === "both") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload("docx")}
                    className="border-[#4C8C6A] text-[#4C8C6A]"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Word
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 失败状态 */}
          {currentSession && isFailed && (
            <div className="space-y-3 p-4 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-[#C45353]" />
                <span className="text-sm font-medium text-[#C45353]">
                  生成失败
                </span>
              </div>
              <p className="text-xs text-[#596359]">请检查配置后重试</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 底部操作区 */}
      <div className="p-4 border-t bg-white">
        {!isGenerating ? (
          <Button
            onClick={handleStartGenerate}
            disabled={isLoading}
            className="w-full bg-[#4C8C6A] hover:bg-[#3D7A58] text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                创建会话...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                开始生成
              </>
            )}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1 border-[#E3E7DF] text-[#596359]"
            >
              取消
            </Button>
            <Button
              onClick={handleRefresh}
              variant="outline"
              className="border-[#E3E7DF] text-[#596359]"
            >
              <Clock className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GeneratePanel;
