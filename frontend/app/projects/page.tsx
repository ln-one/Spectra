"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Loader2, Plus, ChevronRight } from "lucide-react";

interface Project {
  id: string;
  name: string;
  subject?: string;
  grade_level?: string;
  status: string;
  created_at: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const fetchProjects = async () => {
      try {
        const response = await projectsApi.getProjects();
        setProjects(response.data.projects || []);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold">我的项目</h1>
          <button
            onClick={() => router.push("/projects/new")}
            className="flex items-center gap-1 px-3 py-1.5 bg-black text-white rounded text-sm"
          >
            <Plus className="w-4 h-4" />
            新建
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p>暂无项目</p>
            <button
              onClick={() => router.push("/projects/new")}
              className="mt-4 px-3 py-1.5 bg-black text-white rounded text-sm"
            >
              创建第一个项目
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => router.push(`/projects/${project.id}`)}
                className="flex items-center justify-between p-3 border rounded cursor-pointer hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium">{project.name}</div>
                  {project.subject && (
                    <div className="text-sm text-gray-500">
                      {project.grade_level} · {project.subject}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 pt-4 border-t">
          <button
            onClick={() => {
              TokenStorage.clearTokens();
              router.push("/auth/login");
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
