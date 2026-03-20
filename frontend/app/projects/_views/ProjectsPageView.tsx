"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Plus, FolderOpen, Search, Grid3X3, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectCard, ProjectListItem } from "./ProjectItems";
import { useProjectsPageState } from "./useProjectsPageState";

export default function ProjectsPage() {
  const {
    router,
    projects,
    isLoading,
    deletingProjectId,
    errorMessage,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    filteredProjects,
    handleDeleteProject,
    fetchProjects,
  } = useProjectsPageState();

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

  if (errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
        <div className="w-full max-w-xl rounded-2xl border border-red-100 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">项目加载失败</h2>
          <p className="mt-2 text-sm text-zinc-600 break-all">{errorMessage}</p>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={fetchProjects} className="rounded-full px-5">
              重试
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/auth/login")}
              className="rounded-full px-5"
            >
              重新登录
            </Button>
          </div>
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
            className="rounded-3xl border border-zinc-100 bg-white p-12 text-center"
          >
            <div className="mx-auto w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-zinc-400" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900">还没有项目</h2>
            <p className="text-zinc-500 mt-2 mb-6">
              创建第一个项目开始使用 Spectra
            </p>
            <Button
              onClick={() => router.push("/projects/new")}
              className="rounded-full px-6 bg-zinc-900 hover:bg-zinc-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              新建项目
            </Button>
          </motion.div>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-2xl border border-zinc-100 bg-white p-10 text-center text-zinc-500">
            没有匹配的项目
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {viewMode === "grid" ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
              >
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={() => router.push(`/projects/${project.id}`)}
                    onDelete={() => handleDeleteProject(project)}
                    isDeleting={deletingProjectId === project.id}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                {filteredProjects.map((project) => (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    onClick={() => router.push(`/projects/${project.id}`)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
