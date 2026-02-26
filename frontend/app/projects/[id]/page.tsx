"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { projectsApi, filesApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileUploadDropzone } from "@/components/FileUploadDropzone";
import {
  MessageSquare,
  FileText,
  Sparkles,
  Settings,
  ChevronLeft,
  Trash2,
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

interface FileItem {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: string;
  created_at: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const fetchData = async () => {
      try {
        const [projectRes, filesRes] = await Promise.all([
          projectsApi.getProject(projectId),
          filesApi.getProjectFiles(projectId),
        ]);
        setProject(projectRes.data);
        setFiles(filesRes.data.files || []);
      } catch (error) {
        console.error("Failed to fetch project:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [projectId, router]);

  const handleFileUpload = async (uploadedFiles: File[]) => {
    for (const file of uploadedFiles) {
      try {
        await filesApi.uploadFile(file, projectId);
        const filesRes = await filesApi.getProjectFiles(projectId);
        setFiles(filesRes.data.files || []);
      } catch (error) {
        console.error("Failed to upload file:", error);
      }
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await filesApi.deleteFile(fileId);
      setFiles(files.filter((f) => f.id !== fileId));
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

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

      <main className="flex-1 flex flex-col overflow-hidden">
        <Tabs defaultValue="chat" className="flex-1 flex flex-col">
          <div className="border-b px-6 py-2">
            <TabsList>
              <TabsTrigger value="chat">对话</TabsTrigger>
              <TabsTrigger value="files">文件</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat" className="flex-1 m-0">
            <div className="h-full flex flex-col">
              <div className="flex-1 p-6 overflow-auto">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>AI 对话</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[calc(100%-5rem)]">
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>开始与 AI 助手指引您的教学需求</p>
                        <Button
                          className="mt-4"
                          onClick={() => router.push(`/projects/${projectId}/chat`)}
                        >
                          开始对话
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="files" className="flex-1 m-0">
            <div className="h-full p-6 overflow-auto">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>上传文件</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FileUploadDropzone onUpload={handleFileUpload} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>项目文件</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {files.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        暂无上传文件
                      </p>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {files.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center justify-between p-3 rounded-lg border"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-muted-foreground" />
                                <div>
                                  <p className="text-sm font-medium">{file.filename}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatFileSize(file.file_size)} · {file.file_type}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteFile(file.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
