"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { projectsApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { MessageSquare, FileText, Sparkles, Settings, ChevronLeft } from "lucide-react";
import { GeneratePanel } from "@/components/GeneratePanel";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  name: string;
  grade_level?: string;
  subject?: string;
}

export default function ProjectGeneratePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        toast({
          title: "加载失败",
          description: "无法获取项目信息",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId, router, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto py-8">
        <p>项目不存在</p>
        <Button onClick={() => router.push("/projects")}>返回项目列表</Button>
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
          <h2 className="font-semibold truncate">{project.name}</h2>
          <p className="text-sm text-muted-foreground">
            {project.grade_level} · {project.subject}
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
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent"
          >
            <FileText className="h-4 w-4" />
            预览
          </Link>
          <Link
            href={`/projects/${projectId}/generate`}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm bg-accent"
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

      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto">
          <GeneratePanel projectId={projectId} />
        </div>
      </main>
    </div>
  );
}
