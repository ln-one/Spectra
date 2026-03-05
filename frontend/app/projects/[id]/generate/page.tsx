"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { projectsApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { GeneratePanel } from "@/components/GeneratePanel";
import { Loader2, Bot } from "lucide-react";

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
        const response = await projectsApi.getProject(projectId);
        const projectData = response.data.project;
        if (projectData) {
          setProject(projectData);
        }
      } catch (error) {
        console.error("Failed to fetch project:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F6F7F5]">
        <Loader2 className="h-8 w-8 animate-spin text-[#4C8C6A]" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F6F7F5]">
        <div className="text-center">
          <p className="mb-4 text-[#596359]">项目不存在</p>
          <button
            onClick={() => router.push("/projects")}
            className="px-4 py-2 bg-[#4C8C6A] text-white rounded-md hover:bg-[#3D7A58]"
          >
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F6F7F5]">
      {/* 左侧导航 */}
      <aside className="w-64 bg-white border-r border-[#E3E7DF] flex flex-col">
        <div className="p-4 border-b border-[#E3E7DF]">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="flex items-center gap-2 text-[#596359] hover:text-[#1F2520] transition-colors mb-3"
          >
            <Bot className="h-6 w-6 text-[#4C8C6A]" />
            <span className="font-semibold text-[#1F2520]">Spectra</span>
          </button>
          <h2 className="font-semibold text-[#1F2520] truncate">{project.name}</h2>
          <p className="text-sm text-[#7A857A]">
            {project.grade_level} · {project.subject}
          </p>
        </div>

        <nav className="flex-1 p-2">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-[#596359] hover:bg-[#F6F7F5] transition-colors"
          >
            <span>AI 对话</span>
          </button>
          <button
            onClick={() => router.push(`/projects/${projectId}/preview`)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-[#596359] hover:bg-[#F6F7F5] transition-colors"
          >
            <span>预览下载</span>
          </button>
          <button
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm bg-[#4C8C6A]/10 text-[#4C8C6A] font-medium"
          >
            <span>课件生成</span>
          </button>
          <button
            onClick={() => router.push(`/projects/${projectId}/settings`)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-[#596359] hover:bg-[#F6F7F5] transition-colors"
          >
            <span>项目设置</span>
          </button>
        </nav>
      </aside>

      {/* 主内容区 - 生成面板 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-md mx-auto h-full">
            <GeneratePanel projectId={projectId} className="h-full bg-white rounded-xl shadow-sm border border-[#E3E7DF]" />
          </div>
        </div>
      </main>
    </div>
  );
}
