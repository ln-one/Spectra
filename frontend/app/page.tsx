"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FileUploadDropzone } from "@/components/FileUploadDropzone";
import {
  Plus,
  FileText,
  Clock,
  ChevronRight,
  Search,
  Upload,
  Sparkles,
  FolderOpen,
} from "lucide-react";

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

interface Stats {
  totalProjects: number;
  totalFiles: number;
  recentProjects: Project[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    totalProjects: 0,
    totalFiles: 0,
    recentProjects: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const fetchData = async () => {
      try {
        const response = await projectsApi.getProjects();
        const projects = response.data.projects || [];

        setStats({
          totalProjects: projects.length,
          totalFiles: 0,
          recentProjects: projects.slice(0, 6),
        });
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleFileUpload = async (_files: File[]) => {
    console.warn(
      "File upload handler not implemented - requires project selection"
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
    });
  };

  const filteredProjects = stats.recentProjects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 border-r bg-card hidden md:flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold">Spectra</h1>
          <p className="text-sm text-muted-foreground">AI 课件助手</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => router.push("/")}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            我的项目
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => router.push("/projects/new")}
          >
            <Plus className="mr-2 h-4 w-4" />
            新建项目
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => router.push("/projects")}
          >
            <FileText className="mr-2 h-4 w-4" />
            所有项目
          </Button>
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="container mx-auto px-6 py-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold">我的项目</h1>
              <p className="text-muted-foreground mt-1">
                欢迎回来！您有 {stats.totalProjects} 个项目
              </p>
            </div>
            <Button onClick={() => router.push("/projects/new")}>
              <Plus className="mr-2 h-4 w-4" />
              新建项目
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">项目总数</CardTitle>
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalProjects}</div>
                <p className="text-xs text-muted-foreground">已创建的项目</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">文件总数</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalFiles}</div>
                <p className="text-xs text-muted-foreground">已上传的资料</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">课件生成</CardTitle>
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0</div>
                <p className="text-xs text-muted-foreground">已生成的课件</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>最近项目</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push("/projects")}
                    >
                      查看全部
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索项目..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {filteredProjects.length === 0 ? (
                    <div className="text-center py-8">
                      <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-4">暂无项目</p>
                      <Button onClick={() => router.push("/projects/new")}>
                        <Plus className="mr-2 h-4 w-4" />
                        创建第一个项目
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {filteredProjects.map((project) => (
                        <div
                          key={project.id}
                          className="p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => router.push(`/projects/${project.id}`)}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-medium truncate">
                              {project.name}
                            </h3>
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                          {project.subject && (
                            <p className="text-sm text-muted-foreground">
                              {project.grade_level} · {project.subject}
                            </p>
                          )}
                          <div className="flex items-center mt-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatDate(project.updated_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Upload className="mr-2 h-4 w-4" />
                    快速上传
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FileUploadDropzone onUpload={handleFileUpload} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>快速操作</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => router.push("/projects/new")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    新建项目
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => router.push("/projects")}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    浏览项目
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
