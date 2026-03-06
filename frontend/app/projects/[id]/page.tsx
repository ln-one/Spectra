"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { projectsApi, filesApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Loader2, ArrowLeft, Upload, Trash2 } from "lucide-react";

interface Project {
  id: string;
  name: string;
  subject?: string;
  grade_level?: string;
  status: string;
}

interface FileItem {
  id: string;
  filename: string;
  file_type: string;
  status: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

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
        const projectData = projectRes?.data?.project;
        if (projectData) {
          setProject(projectData);
        }
        setFiles(filesRes?.data?.files ?? []);
      } catch (error) {
        console.error("Failed to fetch project:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [projectId, router]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(uploadedFiles)) {
        await filesApi.uploadFile(file, projectId);
      }
      const filesRes = await filesApi.getProjectFiles(projectId);
      setFiles(filesRes?.data?.files ?? []);
    } catch (error) {
      console.error("Failed to upload file:", error);
    } finally {
      setIsUploading(false);
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <p>项目不存在</p>
          <button
            onClick={() => router.push("/projects")}
            className="mt-4 px-3 py-1.5 bg-black text-white rounded text-sm"
          >
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-1 text-sm text-gray-500 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>

        <h1 className="text-xl font-bold mb-2">{project.name}</h1>
        {project.subject && (
          <p className="text-sm text-gray-500 mb-6">
            {project.grade_level} · {project.subject}
          </p>
        )}

        <div className="border rounded p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium">文件列表</h2>
            <label className="flex items-center gap-1 px-3 py-1.5 bg-black text-white rounded text-sm cursor-pointer">
              <Upload className="w-4 h-4" />
              {isUploading ? "上传中..." : "上传文件"}
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>
          </div>

          {files.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">暂无文件</p>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <span className="text-sm truncate">{file.filename}</span>
                  <button
                    onClick={() => handleFileDelete(file.id)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-4 border-t">
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
