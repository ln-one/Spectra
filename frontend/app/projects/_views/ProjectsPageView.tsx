"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  Grid3X3,
  List,
  Settings,
  Grid,
  LayoutGrid,
  SlidersHorizontal,
  Bell,
  User,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ProjectCard,
  ProjectListItem,
  FeaturedProjectCard,
  NewProjectCard,
  ProjectSkeleton,
} from "./ProjectItems";
import { useProjectsPageState } from "./useProjectsPageState";

export default function ProjectsPage() {
  const {
    router,
    user,
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
    handleLogout,
    fetchProjects,
  } = useProjectsPageState();

  // Simulate featured projects (e.g., first 3)
  const featuredProjects = projects.slice(0, 4);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f9f9f9] p-8">
        <div className="max-w-7xl mx-auto">
          <ProjectSkeleton />
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9f9] px-6">
        <div className="w-full max-w-xl rounded-[2.5rem] border border-red-50 bg-white p-12 text-center shadow-xl">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
            <Bell className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900">项目加载失败</h2>
          <p className="mt-4 text-zinc-500 break-all leading-relaxed">
            {errorMessage}
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button
              onClick={fetchProjects}
              className="rounded-full px-8 py-6 bg-zinc-900 hover:bg-zinc-800 transition-all"
            >
              尝试重连
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f9f9] pb-20">
      {/* Global Dashboard Header */}
      <header className="sticky top-0 z-30 bg-[#f9f9f9]/80 backdrop-blur-2xl border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => router.push("/")}
            >
              <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-white" />
              </div>
              <span className="text-xl font-black tracking-tight text-zinc-900">
                Spectra
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-zinc-200/50"
            >
              <Settings className="w-5 h-5 text-zinc-600" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-zinc-200/50"
            >
              <Grid className="w-5 h-5 text-zinc-600" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border-4 border-white bg-white/80 pr-2 shadow-sm transition-all hover:shadow-md"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                      {user?.username?.[0]?.toUpperCase() ?? (
                        <User className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-4 w-4 text-zinc-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-2xl border-zinc-100 p-2 shadow-2xl"
              >
                <DropdownMenuLabel className="rounded-xl bg-zinc-50 px-3 py-2.5">
                  <div className="text-sm font-semibold text-zinc-900 break-words">
                    {user?.username ?? "用户"}
                  </div>
                  <div className="mt-0.5 text-xs font-medium text-zinc-500 break-words">
                    {user?.email ?? ""}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1 bg-zinc-100" />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleLogout();
                  }}
                  className="gap-2 rounded-xl py-2.5 text-[13px] font-medium text-red-600 focus:bg-red-50 focus:text-red-600"
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-10">
        {/* Navigation & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-2 p-1.5 bg-zinc-200/50 rounded-2xl w-fit">
            <button className="px-6 py-2.5 rounded-xl bg-white text-zinc-900 shadow-sm text-sm font-bold transition-all">
              全部
            </button>
            <button className="px-6 py-2.5 rounded-xl text-zinc-500 hover:text-zinc-800 text-sm font-bold transition-all">
              我的笔记本
            </button>
            <button className="px-6 py-2.5 rounded-xl text-zinc-500 hover:text-zinc-800 text-sm font-bold transition-all">
              精选笔记本
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-zinc-600 transition-colors" />
              <Input
                placeholder="搜索您的学习资源..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:w-80 h-12 pl-11 pr-4 bg-zinc-200/50 border-none rounded-2xl focus-visible:ring-2 focus-visible:ring-zinc-300 transition-all font-medium"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-zinc-200/50 rounded-xl">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  viewMode === "grid"
                    ? "bg-white shadow-sm text-zinc-900"
                    : "text-zinc-400 hover:text-zinc-600"
                )}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  viewMode === "list"
                    ? "bg-white shadow-sm text-zinc-900"
                    : "text-zinc-400 hover:text-zinc-600"
                )}
              >
                <List className="w-5 h-5" />
              </button>
            </div>

            <Button className="h-12 px-6 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-sm font-bold transition-all shadow-lg hover:shadow-xl active:scale-95 gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              筛选
            </Button>

            <Button
              onClick={() => router.push("/projects/new")}
              className="h-12 px-8 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-sm font-bold transition-all shadow-lg hover:shadow-xl active:scale-95 gap-2"
            >
              <Plus className="w-5 h-5" />
              新建
            </Button>
          </div>
        </div>

        {projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-32 bg-white rounded-[3rem] border border-zinc-100 shadow-sm"
          >
            <div className="w-24 h-24 rounded-[2rem] bg-zinc-50 flex items-center justify-center mb-8 shadow-inner">
              <Plus className="w-12 h-12 text-zinc-200" />
            </div>
            <h2 className="text-3xl font-black text-zinc-900 mb-4 tracking-tight">
              开启您的 Spectra 之旅
            </h2>
            <p className="text-zinc-500 text-lg mb-10 max-w-sm text-center font-medium">
              尚未发现任何项目。点击下方按钮，开始您的第一个智慧教学实践。
            </p>
            <Button
              onClick={() => router.push("/projects/new")}
              className="h-14 px-10 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-base font-bold shadow-2xl hover:scale-105 transition-all"
            >
              创建第一个笔记本
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-20">
            {/* Featured Section */}
            {!searchQuery && viewMode === "grid" && (
              <section className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-black tracking-tight text-zinc-900">
                    精选笔记本
                  </h2>
                  <Button
                    variant="ghost"
                    className="text-zinc-500 hover:text-zinc-900 font-bold hover:bg-zinc-100 rounded-xl px-4"
                  >
                    查看全部 <Plus className="ml-2 w-4 h-4 rotate-45" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {featuredProjects.map((project) => (
                    <FeaturedProjectCard
                      key={project.id}
                      project={project}
                      onClick={() => router.push(`/projects/${project.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* List/Grid Section */}
            <section className="space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-black tracking-tight text-zinc-900">
                  {searchQuery
                    ? `搜索结果 (${filteredProjects.length})`
                    : "最近打开过的笔记本"}
                </h2>
              </div>

              <AnimatePresence mode="popLayout">
                {viewMode === "grid" ? (
                  <motion.div
                    key="grid"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:grid-cols-5 gap-6"
                  >
                    {!searchQuery && (
                      <NewProjectCard
                        onClick={() => router.push("/projects/new")}
                      />
                    )}
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
                    className="space-y-4"
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
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
