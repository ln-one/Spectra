"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, Clock, ChevronRight, Search, X } from "lucide-react";

interface Project {
  id: string;
  name: string;
  description?: string;
  subject?: string;
  grade_level?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      const response = await projectsApi.getProjects();
      setProjects(response.data.projects || []);
      return;
    }

    try {
      const response = await projectsApi.searchProjects({ q: searchQuery });
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error("Failed to search projects:", error);
    }
  };

  const clearSearch = async () => {
    setSearchQuery("");
    const response = await projectsApi.getProjects();
    setProjects(response.data.projects || []);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">我的项目</h1>
          <p className="text-muted-foreground mt-1">管理您的教学项目</p>
        </div>
        <Button onClick={() => router.push("/projects/new")}>
          <Plus className="mr-2 h-4 w-4" />
          新建项目
        </Button>
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索项目名称或描述..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      </form>

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">暂无项目</h3>
            <p className="text-muted-foreground mb-6">
              创建您的第一个课件项目开始使用
            </p>
            <Button onClick={() => router.push("/projects/new")}>
              <Plus className="mr-2 h-4 w-4" />
              创建项目
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
                {project.subject && (
                  <span className="text-sm text-muted-foreground">
                    {project.grade_level} · {project.subject}
                  </span>
                )}
              </CardHeader>
              <CardContent>
                {project.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {project.description}
                  </p>
                )}
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-1" />
                  {formatDate(project.updated_at)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
