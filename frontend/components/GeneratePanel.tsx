"use client";

import { useState } from "react";
import {
  useGenerateStore,
  type TaskType,
  type GenerationTask,
} from "@/stores/generateStore";
import { generateApi } from "@/lib/api/generate";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Download,
  Presentation,
  FileText,
  Loader2,
  Play,
  Square,
  RefreshCw,
  Palette,
  Hash,
  Film,
  Gamepad2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface GenerateOptions {
  template?: "default" | "gaia" | "uncover" | "academic";
  theme_color?: string;
  show_page_number?: boolean;
  header?: string;
  footer?: string;
  pages?: number;
  include_animations?: boolean;
  include_games?: boolean;
  animation_format?: "gif" | "mp4" | "html5";
}

interface GeneratePanelProps {
  projectId: string;
  className?: string;
}

const TEMPLATE_OPTIONS = [
  { value: "default", label: "默认模板", description: "简洁现代的通用风格" },
  { value: "gaia", label: "Gaia", description: "自然主题风格" },
  { value: "uncover", label: "Uncover", description: "创意展示风格" },
  { value: "academic", label: "Academic", description: "学术风格" },
];

const THEME_COLORS = [
  { value: "#4A90E2", label: "蓝色", class: "bg-blue-500" },
  { value: "#52C41A", label: "绿色", class: "bg-green-500" },
  { value: "#FA8C16", label: "橙色", class: "bg-orange-500" },
  { value: "#EB2F96", label: "粉色", class: "bg-pink-500" },
  { value: "#722ED1", label: "紫色", class: "bg-purple-500" },
  { value: "#13C2C2", label: "青色", class: "bg-cyan-500" },
];

export function GeneratePanel({ projectId, className }: GeneratePanelProps) {
  const {
    currentTask,
    tasks,
    isLoading,
    isPolling,
    error,
    createTask,
    pollTaskStatus,
    stopPolling,
    fetchTaskStatus,
    clearTasks,
  } = useGenerateStore();

  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState<TaskType>("ppt");
  const [options, setOptions] = useState<GenerateOptions>({
    template: "default",
    theme_color: "#4A90E2",
    show_page_number: true,
    pages: 10,
    include_animations: false,
    include_games: false,
  });

  const handleStartGenerate = async () => {
    try {
      const task = await createTask(projectId, selectedType, {
        template: options.template || "default",
        theme_color: options.theme_color,
        show_page_number: options.show_page_number ?? true,
        header: options.header,
        footer: options.footer,
        pages: options.pages,
        include_animations: options.include_animations ?? false,
        include_games: options.include_games ?? false,
        animation_format: options.animation_format,
      });
      pollTaskStatus(task.id);
      toast({
        title: "开始生成",
        description: "任务已创建，正在生成课件...",
      });
    } catch (error) {
      toast({
        title: "生成失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    if (currentTask) {
      stopPolling();
      toast({
        title: "已取消",
        description: "生成任务已取消",
      });
    }
  };

  const handleDownload = async (fileType: "pptx" | "docx") => {
    if (!currentTask) return;

    try {
      const blob = await generateApi.downloadCourseware(
        currentTask.id,
        fileType
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectId}_${fileType}.${fileType}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "下载成功",
        description: `${fileType.toUpperCase()} 文件已下载`,
      });
    } catch (error) {
      toast({
        title: "下载失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    }
  };

  const handleRefresh = async () => {
    if (currentTask) {
      await fetchTaskStatus(currentTask.id);
    }
  };

  const isGenerating =
    currentTask?.status === "processing" || currentTask?.status === "pending";
  const isCompleted = currentTask?.status === "completed";
  const isFailed = currentTask?.status === "failed";

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Presentation className="h-5 w-5" />
          课件生成
        </CardTitle>
        <CardDescription>选择生成类型和选项，创建您的教学课件</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="generate" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate">生成</TabsTrigger>
            <TabsTrigger value="history">
              历史记录
              {tasks.length > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                  {tasks.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-6">
            <div className="space-y-4">
              <Label>生成类型</Label>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant={selectedType === "ppt" ? "default" : "outline"}
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  onClick={() => setSelectedType("ppt")}
                  disabled={isGenerating}
                >
                  <Presentation className="h-6 w-6" />
                  <span>PPT</span>
                </Button>
                <Button
                  variant={selectedType === "word" ? "default" : "outline"}
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  onClick={() => setSelectedType("word")}
                  disabled={isGenerating}
                >
                  <FileText className="h-6 w-6" />
                  <span>Word</span>
                </Button>
                <Button
                  variant={selectedType === "both" ? "default" : "outline"}
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  onClick={() => setSelectedType("both")}
                  disabled={isGenerating}
                >
                  <Presentation className="h-6 w-6" />
                  <FileText className="h-6 w-6" />
                  <span>全部</span>
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                <Label>模板风格</Label>
              </div>
              <Select
                value={options.template}
                onValueChange={(value) =>
                  setOptions({
                    ...options,
                    template: value as GenerateOptions["template"],
                  })
                }
                disabled={isGenerating}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择模板" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_OPTIONS.map((template) => (
                    <SelectItem key={template.value} value={template.value}>
                      <div className="flex flex-col">
                        <span>{template.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {template.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                <Label>主题色</Label>
              </div>
              <div className="flex gap-2">
                {THEME_COLORS.map((color) => (
                  <button
                    key={color.value}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-all",
                      options.theme_color === color.value
                        ? "border-primary scale-110"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: color.value }}
                    onClick={() =>
                      setOptions({ ...options, theme_color: color.value })
                    }
                    disabled={isGenerating}
                    title={color.label}
                  />
                ))}
                <Input
                  type="color"
                  value={options.theme_color || "#4A90E2"}
                  onChange={(e) =>
                    setOptions({ ...options, theme_color: e.target.value })
                  }
                  className="w-8 h-8 p-0.5"
                  disabled={isGenerating}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                <Label>页数</Label>
              </div>
              <Input
                type="number"
                min={1}
                max={100}
                value={options.pages || 10}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    pages: parseInt(e.target.value) || 10,
                  })
                }
                disabled={isGenerating}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="showPageNumber"
                checked={options.show_page_number}
                onCheckedChange={(checked) =>
                  setOptions({
                    ...options,
                    show_page_number: checked as boolean,
                  })
                }
                disabled={isGenerating}
              />
              <Label htmlFor="showPageNumber">显示页码</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeAnimations"
                checked={options.include_animations}
                onCheckedChange={(checked) =>
                  setOptions({
                    ...options,
                    include_animations: checked as boolean,
                  })
                }
                disabled={isGenerating}
              />
              <Label
                htmlFor="includeAnimations"
                className="flex items-center gap-2"
              >
                <Film className="h-4 w-4" />
                包含动画创意
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeGames"
                checked={options.include_games}
                onCheckedChange={(checked) =>
                  setOptions({ ...options, include_games: checked as boolean })
                }
                disabled={isGenerating}
              />
              <Label htmlFor="includeGames" className="flex items-center gap-2">
                <Gamepad2 className="h-4 w-4" />
                包含互动游戏
              </Label>
            </div>

            {currentTask && isGenerating && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label>生成进度</Label>
                  <span className="text-sm text-muted-foreground">
                    {currentTask.progress}%
                  </span>
                </div>
                <Progress value={currentTask.progress} className="h-2" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在生成
                  {currentTask.taskType === "ppt"
                    ? "PPT"
                    : currentTask.taskType === "word"
                      ? "Word文档"
                      : "课件"}
                  ...
                </div>
              </div>
            )}

            {currentTask && isCompleted && (
              <div className="space-y-3 pt-4 border-t">
                <Alert>
                  <AlertDescription>
                    生成完成！您可以下载课件文件。
                  </AlertDescription>
                </Alert>
                <div className="flex gap-2">
                  {(selectedType === "ppt" || selectedType === "both") && (
                    <Button
                      onClick={() => handleDownload("pptx")}
                      className="flex-1"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      下载 PPT
                    </Button>
                  )}
                  {(selectedType === "word" || selectedType === "both") && (
                    <Button
                      onClick={() => handleDownload("docx")}
                      variant="outline"
                      className="flex-1"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      下载 Word
                    </Button>
                  )}
                </div>
              </div>
            )}

            {currentTask && isFailed && (
              <div className="space-y-3 pt-4 border-t">
                <Alert variant="destructive">
                  <AlertDescription>
                    {currentTask.errorMessage || "生成失败，请重试"}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {!isGenerating ? (
                <Button
                  onClick={handleStartGenerate}
                  className="flex-1"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      创建任务...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      开始生成
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    className="flex-1"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    取消
                  </Button>
                  <Button
                    onClick={handleRefresh}
                    variant="outline"
                    disabled={isPolling}
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", isPolling && "animate-spin")}
                    />
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无生成历史
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onDownload={handleDownload}
                  />
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearTasks}
                  className="w-full"
                >
                  清空历史记录
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface TaskItemProps {
  task: GenerationTask;
  onDownload: (fileType: "pptx" | "docx") => void;
}

function TaskItem({ task, onDownload }: TaskItemProps) {
  const statusColors = {
    pending: "bg-yellow-500",
    processing: "bg-blue-500",
    completed: "bg-green-500",
    failed: "bg-red-500",
  };

  const statusLabels = {
    pending: "等待中",
    processing: "生成中",
    completed: "已完成",
    failed: "失败",
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <div
          className={cn("h-2 w-2 rounded-full", statusColors[task.status])}
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {task.taskType === "ppt"
              ? "PPT"
              : task.taskType === "word"
                ? "Word"
                : "全部"}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(task.createdAt).toLocaleString("zh-CN")}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {task.status === "processing" && (
          <span className="text-xs text-muted-foreground">
            {task.progress}%
          </span>
        )}
        {task.status === "completed" && (
          <Button size="sm" onClick={() => onDownload("pptx")}>
            <Download className="h-3 w-3" />
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {statusLabels[task.status]}
        </span>
      </div>
    </div>
  );
}

export default GeneratePanel;
