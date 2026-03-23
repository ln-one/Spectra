"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { projectsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import {
  Loader2,
  ArrowLeft,
  Sparkles,
  Paperclip,
  X,
  ChevronDown,
  ArrowRight,
  FileText,
  Shield,
  Users,
  Layers,
  Settings,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";

export default function NewProjectPage() {
  const router = useRouter();
  const uploadFile = useProjectStore((state) => state.uploadFile);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: "",
    grade_level: "初中",
    base_project_id: "",
    reference_mode: "follow" as "follow" | "pinned",
    visibility: "private" as "private" | "shared",
    is_referenceable: false,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setPendingFiles((prev) => [...prev, ...Array.from(files)]);
    }
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() && !formData.name.trim()) {
      toast({ title: "请输入项目描述", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // Use prompt as name if name is empty
      const projectName =
        formData.name.trim() ||
        prompt.trim().split("\n")[0].substring(0, 20) ||
        "新项目";

      const response = await projectsApi.createProject({
        name: projectName,
        description: prompt,
        grade_level: formData.grade_level,
        base_project_id: formData.base_project_id || undefined,
        reference_mode: formData.reference_mode,
        visibility: formData.visibility,
        is_referenceable: formData.is_referenceable,
      });

      const projectId = response?.data?.project?.id;
      if (projectId) {
        if (pendingFiles.length > 0) {
          setIsUploadingFiles(true);
          // Sequential upload to avoid overwhelming
          for (const file of pendingFiles) {
            try {
              await uploadFile(file, projectId);
            } catch (err) {
              console.error(`Failed to upload ${file.name}:`, err);
            }
          }
        }
        router.push(`/projects/${projectId}`);
        return;
      }
    } catch (error) {
      toast({
        title: "创建失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsUploadingFiles(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcfc] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-50 rounded-full blur-[120px] opacity-50 transition-all duration-1000" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-50 rounded-full blur-[120px] opacity-50 transition-all duration-1000" />

      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => router.push("/projects")}
        className="absolute top-8 left-8 flex items-center gap-2 text-zinc-400 hover:text-zinc-900 transition-colors group"
      >
        <div className="w-10 h-10 rounded-full border border-zinc-100 flex items-center justify-center group-hover:bg-zinc-50 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </div>
        <span className="font-bold text-sm">返回工作台</span>
      </motion.button>

      <div className="w-full max-w-4xl space-y-12">
        {/* Title Section */}
        <div className="text-center space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-900 text-white shadow-xl shadow-zinc-200"
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              Spectra Agent
            </span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-6xl font-black text-zinc-900 tracking-tight"
          >
            开启您的智慧教学
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-zinc-400 text-lg font-medium"
          >
            只需一句话，Spectra 将为您构建完整的教学空间。
          </motion.p>
        </div>

        {/* Central Input Box */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative group"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-[2.5rem] blur opacity-15 group-focus-within:opacity-40 transition duration-500" />
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl shadow-zinc-200/50 border border-zinc-100 p-8 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                </div>
                <h2 className="text-xl font-black text-zinc-900 tracking-tight">
                  教学构想{" "}
                  <span className="text-blue-600">(AI Agent 核心输入)</span>
                </h2>
              </div>
              <Textarea
                placeholder="在此描述您的教学构想，Spectra AI 将为您准备好一切..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full min-h-[200px] text-2xl font-bold border-none focus-visible:ring-0 resize-none p-4 bg-zinc-50/30 rounded-2xl placeholder:text-zinc-200 leading-relaxed"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-zinc-50">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl h-12 px-6 gap-2 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 transition-all font-bold"
                >
                  <Paperclip className="w-5 h-5" />
                  添加素材 ({pendingFiles.length})
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    toast({
                      title: "库选择功能开发中",
                      description: "此功能将在后续版本中上线。",
                    })
                  }
                  className="rounded-2xl h-12 px-6 gap-2 text-zinc-500 hover:text-purple-600 hover:bg-purple-50 transition-all font-bold"
                >
                  <Library className="w-5 h-5" />
                  添加库
                </Button>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={
                  isLoading || (!prompt.trim() && !formData.name.trim())
                }
                className="h-14 px-10 rounded-[1.5rem] bg-zinc-900 hover:bg-zinc-800 text-lg font-black shadow-2xl hover:scale-[1.03] transition-all active:scale-95 disabled:scale-100"
              >
                {isLoading ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>
                      {isUploadingFiles ? "正在上传素材..." : "构思中..."}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span>开始创造</span>
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </Button>
            </div>

            {/* Pending Files List */}
            <AnimatePresence>
              {pendingFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-2 overflow-hidden"
                >
                  {pendingFiles.map((file, i) => (
                    <motion.div
                      key={`${file.name}-${i}`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-2 px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-100 group/file"
                    >
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-bold text-zinc-600 truncate max-w-[120px]">
                        {file.name}
                      </span>
                      <button
                        onClick={() => removeFile(i)}
                        className="p-1 rounded-full hover:bg-zinc-200 text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Advanced Options Toggle */}
        <div className="flex flex-col items-center space-y-8">
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2.5 text-zinc-500 hover:text-zinc-900 font-bold text-sm transition-all py-2.5 px-6 rounded-full bg-zinc-100/50 border border-zinc-100/50 hover:bg-zinc-100 hover:border-zinc-200"
          >
            <Settings className="w-4 h-4 text-zinc-400" />
            <span>更多自定义选项</span>
            <ChevronDown
              className={cn(
                "w-4 h-4 transition-transform text-zinc-400",
                showAdvanced && "rotate-180"
              )}
            />
          </motion.button>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, y: -20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -20, height: 0 }}
                className="w-full bg-white rounded-[2rem] border border-zinc-100 p-8 shadow-xl overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {/* Name Input */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      项目名称 (可选)
                    </label>
                    <Input
                      placeholder="未填写将基于构想生成"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="h-12 rounded-xl border-zinc-100 bg-zinc-50 focus:bg-white transition-all font-bold"
                    />
                  </div>

                  {/* Grade Level */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      学段选择
                    </label>
                    <div className="flex gap-2 p-1 bg-zinc-50 rounded-xl">
                      {["小学", "初中", "高中", "大学"].map((g) => (
                        <button
                          key={g}
                          onClick={() =>
                            setFormData({ ...formData, grade_level: g })
                          }
                          className={cn(
                            "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
                            formData.grade_level === g
                              ? "bg-white text-zinc-900 shadow-sm"
                              : "text-zinc-400 hover:text-zinc-600"
                          )}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Visibility */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      可见性设置
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setFormData({
                            ...formData,
                            visibility: "private",
                            is_referenceable: false,
                          })
                        }
                        className={cn(
                          "flex-1 h-12 rounded-xl border flex items-center justify-center gap-2 transition-all font-bold text-xs",
                          formData.visibility === "private"
                            ? "bg-zinc-900 border-zinc-900 text-white shadow-lg"
                            : "bg-white border-zinc-100 text-zinc-400"
                        )}
                      >
                        <Shield className="w-4 h-4" />
                        私有
                      </button>
                      <button
                        onClick={() =>
                          setFormData({ ...formData, visibility: "shared" })
                        }
                        className={cn(
                          "flex-1 h-12 rounded-xl border flex items-center justify-center gap-2 transition-all font-bold text-xs",
                          formData.visibility === "shared"
                            ? "bg-zinc-900 border-zinc-900 text-white shadow-lg"
                            : "bg-white border-zinc-100 text-zinc-400"
                        )}
                      >
                        <Users className="w-4 h-4" />
                        共享
                      </button>
                    </div>
                  </div>

                  {/* Reference Mode */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      引用模式
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setFormData({ ...formData, reference_mode: "follow" })
                        }
                        className={cn(
                          "flex-1 h-12 rounded-xl border flex items-center justify-center gap-2 transition-all font-bold text-xs",
                          formData.reference_mode === "follow"
                            ? "bg-zinc-50 border-zinc-200 text-zinc-900"
                            : "bg-white border-zinc-100 text-zinc-400"
                        )}
                      >
                        跟随 (Follow)
                      </button>
                      <button
                        onClick={() =>
                          setFormData({ ...formData, reference_mode: "pinned" })
                        }
                        className={cn(
                          "flex-1 h-12 rounded-xl border flex items-center justify-center gap-2 transition-all font-bold text-xs",
                          formData.reference_mode === "pinned"
                            ? "bg-zinc-50 border-zinc-200 text-zinc-900"
                            : "bg-white border-zinc-100 text-zinc-400"
                        )}
                      >
                        固定 (Pinned)
                      </button>
                    </div>
                  </div>

                  {/* Father ID */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      父项目 ID
                    </label>
                    <div className="relative">
                      <Layers className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <Input
                        placeholder="例如: proj_123"
                        value={formData.base_project_id}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            base_project_id: e.target.value,
                          })
                        }
                        className="h-12 pl-11 rounded-xl border-zinc-100 bg-zinc-50 focus:bg-white transition-all font-bold"
                      />
                    </div>
                  </div>

                  {/* Allow Reference */}
                  {formData.visibility === "shared" && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 pt-6"
                    >
                      <input
                        type="checkbox"
                        id="is_referenceable_new"
                        checked={formData.is_referenceable}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            is_referenceable: e.target.checked,
                          })
                        }
                        className="w-5 h-5 rounded-lg border-zinc-200 text-zinc-900 focus:ring-zinc-900"
                      />
                      <label
                        htmlFor="is_referenceable_new"
                        className="text-xs font-bold text-zinc-600"
                      >
                        允许被其他项目引用
                      </label>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Branding */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ delay: 1 }}
        className="absolute bottom-8 text-[10px] font-black tracking-widest text-zinc-300 uppercase"
      >
        © 2026 Spectra AI Computing . Next Generation Teaching Engine
      </motion.div>
    </div>
  );
}
