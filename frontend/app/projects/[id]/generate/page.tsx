"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { projectsApi, generateApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/LogoutButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft,
  Sparkles,
  FileText,
  Presentation,
  Loader2,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface GenerationTask {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  result?: {
    pptx?: string;
    docx?: string;
  };
  error?: string;
}

export default function GeneratePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTask, setCurrentTask] = useState<GenerationTask | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  );

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const fetchProject = async () => {
      try {
        const response = await projectsApi.getProject(projectId);
        const projectData = response.data.project;
        if (projectData) {
          setProject(projectData);
        }
      } catch (error) {
        console.error("Failed to fetch project:", error);
        toast({
          title: "加载失败",
          description: "无法加载项目信息",
          variant: "destructive",
        });
      }
    };

    fetchProject();

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [projectId, router, toast, pollingInterval]);

  const startPolling = (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await generateApi.getGenerateStatus(taskId);
        const taskData = response.data;
        const resultData = taskData.result as
          | {
              pptx?: string;
              docx?: string;
              ppt_url?: string;
              word_url?: string;
            }
          | undefined;

        setCurrentTask({
          task_id: taskData.task_id || taskId,
          status: taskData.status || "pending",
          progress: taskData.progress || 0,
          result: resultData
            ? {
                pptx: resultData.pptx || resultData.ppt_url,
                docx: resultData.docx || resultData.word_url,
              }
            : undefined,
          error: taskData.error,
        });

        if (taskData.status === "completed") {
          clearInterval(interval);
          setIsGenerating(false);
          toast({
            title: "生成完成",
            description: "课件已成功生成，可以下载了",
          });
        } else if (taskData.status === "failed") {
          clearInterval(interval);
          setIsGenerating(false);
          toast({
            title: "生成失败",
            description: taskData.error || "生成过程中出现错误",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Failed to poll status:", error);
      }
    }, 2000);

    setPollingInterval(interval);
  };

  const handleGenerate = async () => {
    if (!project) return;

    setIsGenerating(true);
    setCurrentTask(null);

    try {
      const response = await generateApi.generateCourseware({
        project_id: projectId,
        type: "both",
      });

      const taskId = response.data.task_id || "";
      if (!taskId) {
        throw new Error("未返回任务 ID");
      }

      setCurrentTask({
        task_id: taskId,
        status: "pending",
        progress: 0,
      });

      toast({
        title: "生成任务已创建",
        description: "正在生成课件，请稍候...",
      });

      startPolling(taskId);
    } catch (error) {
      setIsGenerating(false);
      toast({
        title: "创建任务失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (fileType: "pptx" | "docx") => {
    if (!currentTask?.task_id) return;

    try {
      toast({
        title: "开始下载",
        description: `正在下载 ${fileType === "pptx" ? "PPT" : "Word"} 文件...`,
      });

      const filename = project?.name
        ? `${project.name}.${fileType}`
        : `courseware.${fileType}`;

      await generateApi.triggerDownload(
        currentTask.task_id,
        fileType,
        filename
      );

      toast({
        title: "下载成功",
        description: "文件已保存到下载文件夹",
      });
    } catch (error) {
      toast({
        title: "下载失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    }
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-6 flex justify-between items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/projects/${projectId}`)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          返回项目
        </Button>
        <LogoutButton />
      </div>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            生成课件
          </h1>
          <p className="text-muted-foreground mt-2">
            为项目 "{project.name}" 生成 PPT 和 Word 教案
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>生成选项</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                将根据项目信息和上传的文件自动生成课件内容
              </p>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                size="lg"
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    开始生成
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {currentTask && (
          <Card>
            <CardHeader>
              <CardTitle>生成进度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    状态: {currentTask.status === "pending" && "等待中"}
                    {currentTask.status === "processing" && "处理中"}
                    {currentTask.status === "completed" && "已完成"}
                    {currentTask.status === "failed" && "失败"}
                  </span>
                  <span className="font-medium">{currentTask.progress}%</span>
                </div>
                <Progress value={currentTask.progress} />
              </div>

              {currentTask.status === "completed" && currentTask.result && (
                <div className="space-y-3 pt-4 border-t">
                  <p className="text-sm font-medium">下载文件：</p>
                  <div className="grid grid-cols-2 gap-3">
                    {currentTask.result.pptx && (
                      <Button
                        onClick={() => handleDownload("pptx")}
                        variant="outline"
                        className="w-full"
                      >
                        <Presentation className="mr-2 h-4 w-4" />
                        下载 PPT
                      </Button>
                    )}
                    {currentTask.result.docx && (
                      <Button
                        onClick={() => handleDownload("docx")}
                        variant="outline"
                        className="w-full"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        下载 Word
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {currentTask.status === "failed" && currentTask.error && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-md">
                  <p className="text-sm font-medium">错误信息：</p>
                  <p className="text-sm mt-1">{currentTask.error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>使用说明</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• 生成过程通常需要 30-60 秒</li>
              <li>• 系统会根据项目描述和上传的文件自动生成内容</li>
              <li>• 生成完成后可以下载 PPT 和 Word 两种格式</li>
              <li>• 如需修改内容，可以在预览页面进行调整</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
