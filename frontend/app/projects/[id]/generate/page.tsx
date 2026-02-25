"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { projectApi, generateApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";

interface Project {
  id: string;
  name: string;
}

export default function ProjectGeneratePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationType, setGenerationType] = useState<"ppt" | "word" | "both">("ppt");
  const [progress, setProgress] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const fetchProject = async () => {
      try {
        const res = await projectApi.getProject(projectId);
        setProject(res.data);
      } catch (error) {
        console.error("Failed to fetch project:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId, router]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress(10);

    try {
      const res = await generateApi.generateCourseware({
        project_id: projectId,
        type: generationType,
      });

      setTaskId(res.data.task_id);
      setProgress(30);

      const pollStatus = async () => {
        if (!taskId) return;

        try {
          const statusRes = await generateApi.getStatus(taskId);
          const status = statusRes.data.status;
          const progressMap: Record<string, number> = {
            pending: 30,
            processing: 50,
            analyzing: 70,
            generating: 85,
            completed: 100,
          };
          setProgress(progressMap[status] || 50);

          if (status === "completed") {
            setIsGenerating(false);
            router.push(`/projects/${projectId}/preview`);
          } else if (status === "failed") {
            setIsGenerating(false);
          } else {
            setTimeout(pollStatus, 3000);
          }
        } catch (error) {
          console.error("Failed to check status:", error);
          setTimeout(pollStatus, 3000);
        }
      };

      setTimeout(pollStatus, 2000);
    } catch (error) {
      console.error("Failed to start generation:", error);
      setIsGenerating(false);
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
          <h2 className="font-semibold">{project?.name}</h2>
        </div>
      </aside>

      <main className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              生成课件
            </CardTitle>
            <CardDescription>
              选择要生成的课件类型和格式
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isGenerating ? (
              <>
                <div className="space-y-3">
                  <Label>课件类型</Label>
                  <RadioGroup
                    value={generationType}
                    onValueChange={(value) => setGenerationType(value as "ppt" | "word" | "both")}
                    className="flex flex-col space-y-1"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="ppt" id="ppt" />
                      <Label htmlFor="ppt" className="font-normal">PPT 演示文稿</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="word" id="word" />
                      <Label htmlFor="word" className="font-normal">Word 教案</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="both" id="both" />
                      <Label htmlFor="both" className="font-normal">PPT + Word (全套)</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">生成说明</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• AI 将根据您的对话内容生成课件</li>
                    <li>• 生成过程可能需要 1-3 分钟</li>
                    <li>• 您可以在预览页面查看和修改</li>
                  </ul>
                </div>

                <Button className="w-full" onClick={handleGenerate} size="lg">
                  <Sparkles className="mr-2 h-4 w-4" />
                  开始生成
                </Button>
              </>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-semibold">正在生成课件...</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    AI 正在根据您的需求创建内容
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>进度</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push(`/projects/${projectId}/preview`)}
                >
                  前往预览
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
