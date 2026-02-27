"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { previewApi, generateApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { type Slide } from "@/components/SlidePreview";
import {
  ChevronLeft,
  ChevronRight,
  Download,
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
        type: "both",
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
        } catch (error) {
          console.error("Failed to poll status:", error);
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

  const handlePrevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleNextSlide = () => {
    if (preview && preview.slides && currentSlide < preview.slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
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
        {!preview || !preview.slides || preview.slides.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <Card className="w-full max-w-md m-8">
              <CardHeader>
                <CardTitle>暂无课件</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  您还没有生成课件，请先在对话中描述您的需求，然后生成课件。
                </p>
                <Button onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    "生成课件"
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="h-full flex">
            <div className="flex-1 p-6 flex flex-col overflow-hidden">
              <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-lg">
                <Card className="w-full max-w-4xl aspect-video flex items-center justify-center">
                  <CardContent className="text-center p-8">
                    <h2 className="text-2xl font-bold mb-4">
                      {preview.slides?.[currentSlide]?.title}
                    </h2>
                    <div className="prose prose-sm max-w-none">
                      {preview.slides?.[currentSlide]?.content}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={handlePrevSlide}
                    disabled={currentSlide === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    上一页
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {currentSlide + 1} / {preview.slides?.length || 0}
                  </span>
                  <Button
                    onClick={handleNextSlide}
                    disabled={currentSlide >= (preview.slides?.length || 0) - 1}
                  >
                    下一页
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="w-80 border-l bg-card flex flex-col overflow-hidden">
              <Tabs defaultValue="slides" className="flex-1 flex flex-col">
                <TabsList className="w-full mx-2 mt-2">
                  <TabsTrigger value="slides" className="flex-1">
                    幻灯片
                  </TabsTrigger>
                  <TabsTrigger value="sources" className="flex-1">
                    来源
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="slides" className="flex-1 mt-0 p-2">
                  <ScrollArea className="h-[calc(100vh-300px)]">
                    <div className="space-y-2">
                      {preview.slides?.map((slide, idx) => (
                        <div
                          key={slide.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${idx === currentSlide
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                            }`}
                          onClick={() => setCurrentSlide(idx)}
                        >
                          <p className="font-medium text-sm">
                            第 {slide.index} 页
                          </p>
                          <p className="text-xs opacity-70 truncate">
                            {slide.title}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="sources" className="flex-1 mt-0 p-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">内容来源</p>
                    {preview.slides?.[currentSlide]?.sources &&
                      preview.slides[currentSlide].sources!.length > 0 ? (
                      <div className="space-y-2">
                        {preview.slides[currentSlide].sources!.map((source, idx) => (
                          <div key={idx} className="text-xs p-2 bg-muted rounded">
                            <p className="font-medium">{source.filename}</p>
                            <p className="text-muted-foreground">
                              {source.source_type === "video" && "视频"}
                              {source.source_type === "document" && "文档"}
                              {source.source_type === "ai_generated" && "AI 生成"}
                              {source.page_number && ` - 第 ${source.page_number} 页`}
                              {source.timestamp && ` - ${source.timestamp}`}
                            </p>
                            {source.preview_text && (
                              <p className="mt-1 truncate">{source.preview_text}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        当前幻灯片无来源信息
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {preview?.task_id && (
                <div className="p-2 border-t">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleDownload(preview.task_id!, "pptx")}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      PPT
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleDownload(preview.task_id!, "docx")}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Word
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
