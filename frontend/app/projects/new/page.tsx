"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/LogoutButton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";

export default function NewProjectPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    subject: "",
    grade_level: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await projectsApi.createProject({
        name: formData.name,
        description: formData.description,
        grade_level: formData.grade_level,
      });
      router.push(`/projects/${response.data.project?.id}`);
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <div className="mb-6 flex justify-between items-center">
        <Button variant="ghost" onClick={() => router.push("/projects")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回项目列表
        </Button>
        <LogoutButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>创建新项目</CardTitle>
          <CardDescription>填写项目信息开始创建课件</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">项目名称 *</Label>
              <Input
                id="name"
                placeholder="例如：初中数学二次函数"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="grade_level">学段 *</Label>
                <Select
                  value={formData.grade_level}
                  onValueChange={(value) =>
                    setFormData({ ...formData, grade_level: value })
                  }
                  required
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
                  onValueChange={(value) =>
                    setFormData({ ...formData, subject: value })
                  }
                  required
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
                placeholder="描述您的教学目标和内容需求..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/projects")}
              >
                取消
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "创建中..." : "创建项目"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
