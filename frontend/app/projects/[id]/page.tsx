"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { projectsApi, filesApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { useGenerateStore } from "@/stores/generateStore";
import { ThreeColumnLayout, StudioPanel, ConversationPanel, SourcesPanel } from "@/components/layout";
import { LogoutButton } from "@/components/LogoutButton";
import { Loader2 } from "lucide-react";

type ViewMode = "chat" | "generate" | "preview";

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
  selected?: boolean;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentMode, setCurrentMode] = useState<ViewMode>("chat");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  // 从 GenerateStore 获取状态
  const { currentTask, isPolling } = useGenerateStore();

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
        const projectData = projectRes.data.project;
        if (projectData) {
          setProject(projectData);
        }
        setFiles(
          (filesRes.data.files || []).map((f: any) => ({
            ...f,
            selected: false,
          }))
        );
      } catch (error) {
        console.error("Failed to fetch project:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [projectId, router]);

  // 监听生成状态
  useEffect(() => {
    if (currentTask) {
      if (currentTask.status === "processing" || currentTask.status === "pending") {
        setIsGenerating(true);
        setGenerationProgress(currentTask.progress || 0);
      } else {
        setIsGenerating(false);
        if (currentTask.status === "completed") {
          setCurrentMode("preview");
        }
      }
    }
  }, [currentTask]);

  const handleFileUpload = async (uploadedFiles: File[]) => {
    for (const file of uploadedFiles) {
      try {
        await filesApi.uploadFile(file, projectId);
        const filesRes = await filesApi.getProjectFiles(projectId);
        setFiles(
          (filesRes.data.files || []).map((f: any) => ({
            ...f,
            selected: false,
          }))
        );
      } catch (error) {
        console.error("Failed to upload file:", error);
      }
    }
  };

  const handleFileDelete = async (fileId: string) => {
    try {
      await filesApi.deleteFile(fileId);
      setFiles(files.filter((f) => f.id !== fileId));
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  const handleFileSelect = (fileId: string, selected: boolean) => {
    setFiles(
      files.map((f) => (f.id === fileId ? { ...f, selected } : f))
    );
  };

  const handleModeChange = (mode: ViewMode) => {
    setCurrentMode(mode);
  };

  const handleStartGenerate = () => {
    setCurrentMode("generate");
    router.push(`/projects/${projectId}/generate`);
  };

  const handleSendMessage = (message: string) => {
    console.log("Sending message:", message);
    // TODO: 实现消息发送逻辑
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="mb-4">项目不存在</p>
          <button
            onClick={() => router.push("/projects")}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen">
      {/* Global Header */}
      <header className="h-14 border-b bg-background flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold">{project.name}</h1>
          <span className="text-sm text-muted-foreground">
            {project.grade_level} · {project.subject}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LogoutButton />
        </div>
      </header>

      {/* 三栏布局 */}
      <div className="h-[calc(100vh-3.5rem)]">
        <ThreeColumnLayout
          leftWidth="280px"
          rightWidth="320px"
          leftPanel={
            <StudioPanel
              projectId={projectId}
              currentMode={currentMode}
              onModeChange={handleModeChange}
            />
          }
          centerPanel={
            <ConversationPanel
              projectId={projectId}
              currentMode={currentMode}
              isGenerating={isGenerating}
              generationProgress={generationProgress}
              onSendMessage={handleSendMessage}
              onStartGenerate={handleStartGenerate}
            />
          }
          rightPanel={
            <SourcesPanel
              projectId={projectId}
              files={files}
              onFileUpload={handleFileUpload}
              onFileDelete={handleFileDelete}
              onFileSelect={handleFileSelect}
            />
          }
        />
      </div>
    </div>
  );
}
