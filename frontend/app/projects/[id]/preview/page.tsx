"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { previewApi, generateApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SlidePreview, type Slide } from "@/components/SlidePreview";
import { ProgressTracker } from "@/components/ProgressTracker";
import { ModifyChat } from "@/components/ModifyChat";
import {
  ChevronLeft,
  Loader2,
  MessageSquare,
  FileText,
  Settings,
  Sparkles,
} from "lucide-react";

interface PreviewData {
  task_id?: string;
  status?: string;
  slides?: Slide[];
  current_slide?: number;
  word_url?: string;
}

interface Project {
  id: string;
  name: string;
  grade_level: string;
  subject: string;
}

export default function ProjectPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const fetchData = async () => {
      try {
        const [projectRes, previewRes] = await Promise.all([
          fetch(`/api/v1/projects/${projectId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then((r) => r.json()),
          previewApi.getPreview(projectId),
        ]);

        if (projectRes.data?.project) {
          setProject(projectRes.data.project);
        }

        const previewData: PreviewData = {
          task_id: previewRes.data.task_id,
          slides: previewRes.data.slides || [],
          current_slide: 0,
        };
        setPreview(previewData);
      } catch {
        console.error("Failed to fetch data");
        toast({
          title: "加载失败",
          description: "无法获取项目信息",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [projectId, router, toast]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await generateApi.generateCourseware({
        project_id: projectId,
        type: "ppt",
      });

      const taskId = res.data.task_id;
      if (!taskId) {
        setIsGenerating(false);
        return;
      }

      const pollStatus = async () => {
        try {
          const statusRes = await generateApi.getGenerateStatus(taskId);
          if (statusRes.data.status === "completed") {
            const previewRes = await previewApi.getPreview(projectId);
            const previewData: PreviewData = {
              task_id: previewRes.data.task_id,
              slides: previewRes.data.slides || [],
              current_slide: 0,
            };
            setPreview(previewData);
            setCurrentSlide(0);
            setIsGenerating(false);
            toast({
              title: "生成完成",
              description: "课件已成功生成",
            });
          } else if (statusRes.data.status === "failed") {
            setIsGenerating(false);
            toast({
              title: "生成失败",
              description: statusRes.data.error || "请稍后重试",
              variant: "destructive",
            });
          } else {
            setTimeout(pollStatus, 3000);
          }
        } catch {
          setIsGenerating(false);
        }
      };

      setTimeout(pollStatus, 3000);
    } catch {
      console.error("Failed to generate");
      setIsGenerating(false);
      toast({
        title: "生成失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    }
  };

  const handleModifyComplete = () => {
    previewApi.getPreview(projectId).then((res) => {
      const previewData: PreviewData = {
        task_id: res.data.task_id,
        slides: res.data.slides || [],
        current_slide: 0,
      };
      setPreview(previewData);
      setCurrentSlide(0);
      toast({
        title: "修改完成",
        description: "课件已更新",
      });
    });
  };

  const handleDownload = async (taskId: string, fileType: "pptx" | "docx") => {
    try {
      await generateApi.triggerDownload(taskId, fileType);
      toast({
        title: "下载成功",
        description: `课件已下载为 ${fileType.toUpperCase()} 格式`,
      });
    } catch {
      toast({
        title: "下载失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/projects")}
            className="mb-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            返回
          </Button>
          <h2 className="font-semibold truncate">{project?.name || "预览"}</h2>
          <p className="text-sm text-muted-foreground">
            {project?.grade_level} · {project?.subject}
          </p>
        </div>

        <nav className="flex-1 p-2">
          <Link
            href={`/projects/${projectId}`}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent"
          >
            <MessageSquare className="h-4 w-4" />
            对话
          </Link>
          <Link
            href={`/projects/${projectId}/preview`}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm bg-accent"
          >
            <FileText className="h-4 w-4" />
            预览
          </Link>
          <Link
            href={`/projects/${projectId}/generate`}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent"
          >
            <Sparkles className="h-4 w-4" />
            生成
          </Link>
          <Link
            href={`/projects/${projectId}/settings`}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent"
          >
            <Settings className="h-4 w-4" />
            设置
          </Link>
        </nav>
      </aside>

      <main className="flex-1 overflow-hidden">
        <div className="h-full flex">
          <div className="flex-1 p-6 flex flex-col overflow-hidden">
            <div className="flex-1">
              <SlidePreview
                slides={preview?.slides}
                currentSlide={currentSlide}
                onSlideChange={setCurrentSlide}
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
              />
            </div>

            <div className="mt-4">
              <ProgressTracker onDownload={handleDownload} />
            </div>
          </div>

          <div className="w-96 border-l bg-card flex flex-col overflow-hidden">
            {preview?.task_id ? (
              <ModifyChat
                taskId={preview.task_id}
                slideIds={preview.slides?.[currentSlide] ? [preview.slides[currentSlide].id] : undefined}
                onModifyComplete={handleModifyComplete}
                className="h-full border-0 rounded-none"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无课件</p>
                  <p className="text-sm mt-2">请先生成课件后再进行修改</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
