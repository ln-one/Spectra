"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { projectApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Trash2, Loader2 } from "lucide-react";

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

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    subject: "",
    grade_level: "",
  });

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const fetchProject = async () => {
      try {
        const res = await projectApi.getProject(projectId);
        const projectData = res.data;
        setProject(projectData);
        setFormData({
          name: projectData.name,
          description: projectData.description || "",
          subject: projectData.subject || "",
          grade_level: projectData.grade_level || "",
        });
      } catch (error) {
        console.error("Failed to fetch project:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId, router]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await projectApi.updateProject(projectId, {
        name: formData.name,
        description: formData.description,
        subject: formData.subject,
        grade_level: formData.grade_level,
      });
      alert("保存成功");
    } catch (error) {
      console.error("Failed to update project:", error);
      alert("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("确定要删除这个项目吗？此操作不可恢复。")) {
      return;
    }

    setIsDeleting(true);
    try {
      await projectApi.deleteProject(projectId);
      router.push("/projects");
    } catch (error) {
      console.error("Failed to delete project:", error);
      alert("删除失败");
      setIsDeleting(false);
    }
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
            onClick={() => router.push(`/projects/${projectId}`)}
            className="mb-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            返回
          </Button>
          <h2 className="font-semibold">项目设置</h2>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>修改项目的基本信息</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">项目名称 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="grade_level">学段 *</Label>
                  <Select
                    value={formData.grade_level}
                    onValueChange={(value) => setFormData({ ...formData, grade_level: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择学段" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="小学">小学</SelectItem>
                      <SelectItem value="初中">初中</SelectItem>
                      <SelectItem value="高中">高中</SelectItem>
                      <SelectItem value="大学">大学</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">学科 *</Label>
                  <Select
                    value={formData.subject}
                    onValueChange={(value) => setFormData({ ...formData, subject: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择学科" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="语文">语文</SelectItem>
                      <SelectItem value="数学">数学</SelectItem>
                      <SelectItem value="英语">英语</SelectItem>
                      <SelectItem value="物理">物理</SelectItem>
                      <SelectItem value="化学">化学</SelectItem>
                      <SelectItem value="生物">生物</SelectItem>
                      <SelectItem value="历史">历史</SelectItem>
                      <SelectItem value="地理">地理</SelectItem>
                      <SelectItem value="政治">政治</SelectItem>
                      <SelectItem value="其他">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">项目描述</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "保存中..." : "保存修改"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">危险区域</CardTitle>
              <CardDescription>删除项目是一项不可恢复的操作</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? "删除中..." : "删除项目"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
