"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/lib/api";
import { TokenStorage } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Plus,
  FolderOpen,
  Clock,
  ChevronRight,
  Search,
  Grid3X3,
  List,
  MoreVertical,
  Trash2,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Project {
  id: string;
  name: string;
  subject?: string;
  grade_level?: string;
  status: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-zinc-100 text-zinc-600" },
  active: { label: "进行中", color: "bg-blue-50 text-blue-600" },
  completed: { label: "已完成", color: "bg-emerald-50 text-emerald-600" },
  archived: { label: "已归档", color: "bg-zinc-50 text-zinc-500" },
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function ProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const status = statusConfig[project.status] || statusConfig.draft;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className="group relative bg-white rounded-2xl border border-zinc-100 p-5 cursor-pointer hover:shadow-lg hover:border-zinc-200 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-100 flex items-center justify-center group-hover:from-zinc-100 group-hover:to-zinc-150 transition-colors">
          <FolderOpen className="w-6 h-6 text-zinc-400 group-hover:text-zinc-500 transition-colors" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-zinc-100 transition-all"
            >
              <MoreVertical className="w-4 h-4 text-zinc-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem className="gap-2">
              <Settings className="w-4 h-4" />
              设置
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-red-600 focus:text-red-600">
              <Trash2 className="w-4 h-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3 className="font-semibold text-zinc-900 mb-1 truncate">
        {project.name}
      </h3>

      {project.subject && (
        <p className="text-sm text-zinc-500 mb-3">
          {project.grade_level && `${project.grade_level} · `}
          {project.subject}
        </p>
      )}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-50">
        <span
          className={cn(
            "text-xs font-medium px-2.5 py-1 rounded-full",
            status.color
          )}
        >
          {status.label}
        </span>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Clock className="w-3.5 h-3.5" />
          {formatDate(project.created_at)}
        </div>
      </div>

      <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-5 h-5 text-zinc-300" />
      </div>
    </motion.div>
  );
}

function ProjectListItem({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const status = statusConfig[project.status] || statusConfig.draft;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      onClick={onClick}
      className="group flex items-center gap-4 p-4 bg-white rounded-xl border border-zinc-100 cursor-pointer hover:border-zinc-200 hover:shadow-sm transition-all duration-200"
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-zinc-50 to-zinc-100 flex items-center justify-center shrink-0">
        <FolderOpen className="w-5 h-5 text-zinc-400" />
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-zinc-900 truncate">{project.name}</h3>
        {project.subject && (
          <p className="text-sm text-zinc-500">
            {project.grade_level && `${project.grade_level} · `}
            {project.subject}
          </p>
        )}
      </div>

      <span
        className={cn(
          "text-xs font-medium px-2.5 py-1 rounded-full shrink-0",
          status.color
        )}
      >
        {status.label}
      </span>

      <div className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
        <Clock className="w-3.5 h-3.5" />
        {formatDate(project.created_at)}
      </div>

      <ChevronRight className="w-5 h-5 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </motion.div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const fetchProjects = async () => {
      try {
        const response = await projectsApi.getProjects();
        setProjects(response?.data?.projects ?? []);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [router]);

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-zinc-100">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">我的项目</h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                {projects.length} 个项目
              </p>
            </div>
            <Button
              onClick={() => router.push("/projects/new")}
              className="gap-2 bg-zinc-900 hover:bg-zinc-800 rounded-full px-5"
            >
              <Plus className="w-4 h-4" />
              新建项目
            </Button>
          </div>

          {projects.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input
                  placeholder="搜索项目..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-zinc-50 border-zinc-100 focus:bg-white"
                />
              </div>
              <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    viewMode === "grid"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    viewMode === "list"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24"
          >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-50 flex items-center justify-center mb-6 shadow-inner">
              <FolderOpen className="w-10 h-10 text-zinc-300" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 mb-2">
              还没有项目
            </h2>
            <p className="text-zinc-500 mb-6 text-center max-w-sm">
              创建你的第一个项目，开始使用 Spectra 的强大功能
            </p>
            <Button
              onClick={() => router.push("/projects/new")}
              className="gap-2 bg-zinc-900 hover:bg-zinc-800 rounded-full px-6"
            >
              <Plus className="w-4 h-4" />
              创建第一个项目
            </Button>
          </motion.div>
        ) : filteredProjects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16"
          >
            <Search className="w-12 h-12 text-zinc-300 mb-4" />
            <p className="text-zinc-500">没有找到匹配的项目</p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={() => router.push(`/projects/${project.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProjects.map((project) => (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    onClick={() => router.push(`/projects/${project.id}`)}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        )}
      </div>

      <div className="fixed bottom-6 left-6">
        <button
          onClick={() => {
            TokenStorage.clearTokens();
            router.push("/auth/login");
          }}
          className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          退出登录
        </button>
      </div>
    </div>
  );
}
