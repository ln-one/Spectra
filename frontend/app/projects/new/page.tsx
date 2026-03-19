"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/lib/sdk";
import { Loader2, ArrowLeft } from "lucide-react";

export default function NewProjectPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    grade_level: "",
    base_project_id: "",
    reference_mode: "follow" as "follow" | "pinned",
    visibility: "private" as "private" | "shared",
    is_referenceable: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await projectsApi.createProject({
        name: formData.name,
        description: formData.description,
        grade_level: formData.grade_level,
        base_project_id: formData.base_project_id || undefined,
        reference_mode: formData.reference_mode,
        visibility: formData.visibility,
        is_referenceable: formData.is_referenceable,
      });
      const projectId = response?.data?.project?.id;
      if (projectId) {
        router.push(`/projects/${projectId}`);
      }
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-md mx-auto">
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-1 text-sm text-gray-500 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>

        <h1 className="text-xl font-bold mb-6">创建新项目</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm">
              项目名称 *
            </label>
            <input
              id="name"
              placeholder="例如：初中数学二次函数"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm">
              项目描述 *
            </label>
            <textarea
              id="description"
              placeholder="例如：本项目用于生成初中二次函数教学课件与练习"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              required
              className="w-full px-3 py-2 border rounded-md text-sm min-h-[96px]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="grade_level" className="text-sm">
              学段 *
            </label>
            <select
              id="grade_level"
              value={formData.grade_level}
              onChange={(e) =>
                setFormData({ ...formData, grade_level: e.target.value })
              }
              required
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">选择学段</option>
              <option value="小学">小学</option>
              <option value="初中">初中</option>
              <option value="高中">高中</option>
              <option value="大学">大学</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="base_project_id" className="text-sm">
              父项目 ID (可选)
            </label>
            <input
              id="base_project_id"
              placeholder="例如：proj_123"
              value={formData.base_project_id}
              onChange={(e) =>
                setFormData({ ...formData, base_project_id: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="reference_mode" className="text-sm">
                引用模式
              </label>
              <select
                id="reference_mode"
                value={formData.reference_mode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    reference_mode: (e.target as HTMLSelectElement).value as
                      | "follow"
                      | "pinned",
                  })
                }
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="follow">跟随 (Follow)</option>
                <option value="pinned">固定 (Pinned)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="visibility" className="text-sm">
                可见性
              </label>
              <select
                id="visibility"
                value={formData.visibility}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    visibility: (e.target as HTMLSelectElement).value as
                      | "private"
                      | "shared",
                  })
                }
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="private">私有 (Private)</option>
                <option value="shared">共享 (Shared)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              id="is_referenceable"
              checked={formData.is_referenceable}
              onChange={(e) =>
                setFormData({ ...formData, is_referenceable: e.target.checked })
              }
              className="w-4 h-4"
            />
            <label htmlFor="is_referenceable" className="text-sm">
              允许被其他项目引用
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.push("/projects")}
              className="flex-1 py-2 border rounded-md text-sm"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2 bg-black text-white rounded-md text-sm disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                "创建"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
