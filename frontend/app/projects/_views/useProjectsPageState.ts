import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { projectsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { useAuthStore } from "@/stores/authStore";
import type { Project } from "./project-types";

export function useProjectsPageState() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await projectsApi.getProjects();
      setProjects(response?.data?.projects ?? []);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
      const message = error instanceof Error ? error.message : "加载项目失败";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!(await authService.hasActiveSession())) {
        router.push("/auth/login");
        return;
      }

      await fetchProjects();
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router, fetchProjects]);

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [projects, searchQuery]
  );

  const handleDeleteProject = useCallback(async (project: Project) => {
    const confirmed = window.confirm(
      `确认删除项目“${project.name}”吗？此操作无法撤销。`
    );
    if (!confirmed) {
      return;
    }

    setDeletingProjectId(project.id);
    try {
      await projectsApi.deleteProject(project.id);
      setProjects((current) =>
        current.filter((item) => item.id !== project.id)
      );
      toast({
        title: "项目已删除",
        description: `已删除“${project.name}”`,
      });
    } catch (error) {
      console.error("Failed to delete project:", error);
      toast({
        title: "删除项目失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setDeletingProjectId(null);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    logout();
    toast({
      title: "已退出登录",
      description: "正在返回登录页...",
    });
    router.push("/auth/login");
  }, [logout, router]);

  return {
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
  };
}
