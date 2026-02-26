"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { previewApi, generateApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  MessageSquare,
} from "lucide-react";

interface Slide {
  id: string;
  index: number;
  title: string;
  content: string;
  sources?: Array<{
    chunk_id: string;
    source_type: "video" | "document" | "ai_generated";
    filename: string;
    page_number?: number;
    timestamp?: string;
    preview_text?: string;
  }>;
}

interface PreviewData {
  task_id?: string;
  status?: string;
  slides?: Slide[];
  current_slide?: number;
  word_url?: string;
}

export default function ProjectPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

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

    const fetchPreview = async () => {
      try {
        const res = await previewApi.getPreview(projectId);
        const previewData: PreviewData = {
          task_id: res.data.task_id,
          slides: res.data.slides || [],
          current_slide: 0,
        };
        setPreview(previewData);
        setCurrentSlide(0);
      } catch (error) {
        console.error("Failed to fetch preview:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreview();
  }, [projectId, router]);

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
        const statusRes = await generateApi.getGenerateStatus(taskId);
        if (statusRes.data.status === "completed") {
          const previewRes = await previewApi.getPreview(projectId);
          const previewData: PreviewData = {
            task_id: previewRes.data.task_id,
            slides: previewRes.data.slides || [],
            current_slide: 0,
          };
          setPreview(previewData);
          setIsGenerating(false);
        } else if (statusRes.data.status === "failed") {
          setIsGenerating(false);
        } else {
          setTimeout(pollStatus, 3000);
        }
      };

      setTimeout(pollStatus, 3000);
    } catch (error) {
      console.error("Failed to generate:", error);
      setIsGenerating(false);
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

  const handleDownload = async (fileType: "ppt" | "word") => {
    if (!preview) return;

    try {
      const taskId = preview.task_id;
      if (!taskId) return;
      const response = await generateApi.downloadCourseware(taskId, fileType);
      const url = window.URL.createObjectURL(response);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `courseware.${fileType}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Failed to download:", error);
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
            onClick={() => router.push(`/projects/${projectId}`)}
            className="mb-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            返回
          </Button>
          <h2 className="font-semibold">预览</h2>
        </div>
        <div className="p-4">
          <Button
            className="w-full mb-2"
            onClick={() => router.push(`/projects/${projectId}/chat`)}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            修改
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push(`/projects/${projectId}/generate`)}
          >
            重新生成
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
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
          <>
            <div className="flex-1 flex">
              <div className="flex-1 p-8 flex items-center justify-center bg-gray-100">
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

              <div className="w-80 border-l bg-card p-4">
                <Tabs defaultValue="slides">
                  <TabsList className="w-full">
                    <TabsTrigger value="slides" className="flex-1">
                      幻灯片
                    </TabsTrigger>
                    <TabsTrigger value="sources" className="flex-1">
                      来源
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="slides" className="mt-4">
                    <ScrollArea className="h-[calc(100vh-200px)]">
                      <div className="space-y-2">
                        {preview.slides?.map((slide, idx) => (
                          <div
                            key={slide.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                              idx === currentSlide
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

                  <TabsContent value="sources" className="mt-4">
                    <p className="text-sm text-muted-foreground">
                      内容来源信息
                    </p>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            <div className="border-t p-4 flex items-center justify-between">
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
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleDownload("ppt")}>
                  <Download className="h-4 w-4 mr-1" />
                  PPT
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDownload("word")}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Word
                </Button>
                <Button
                  onClick={handleNextSlide}
                  disabled={currentSlide >= (preview.slides?.length || 0) - 1}
                >
                  下一页
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
